import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { formatLocalDateShort } from '@/utils/dateUtils';

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

// Helper function to get TCF based on rounded Celsius (from PanelboardReport)
const getTCF = (celsius: number): number => {
  const roundedCelsius = Math.round(celsius);
  const key = roundedCelsius.toString(); // Use string key for lookup
  return tcfTable[key] !== undefined ? tcfTable[key] : 1; // Default to 1 if not found
};

// Dropdown options
// Updated Visual Inspection options
const visualInspectionResultsOptions = ["", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"];
const contactResistanceUnitsOptions = ["µΩ", "mΩ", "Ω"];
const insulationResistanceUnitsOptions = ["kΩ", "MΩ", "GΩ"];
const insulationTestVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"];
// Updated Pass/Fail/Limited Service options
const equipmentEvaluationResultOptions = ["PASS", "FAIL", "LIMITED SERVICE"];
// I²t Options
const i2tOptions = ["", "Yes", "No", "N/A"];
// Trip Unit Type options
const tripUnitTypeOptions = ["", "On", "Off", "In", "Out", "N/A"];
const tripTestingUnitsOptions = ["sec.", "cycles", "ms"]; // Example options

// Predefined test equipment options
const testEquipmentOptions = {
  megohmmeter: [
    { name: "Fluke 1587", serialNumber: "50340043", ampId: "1-131" },
    { name: "Fluke 1587", serialNumber: "63440124", ampId: "1-153" }
  ],
  lowResistanceOhmmeter: [
    { name: "AEMC 6240", serialNumber: "32172", ampId: "1-130" },
    { name: "Megger DLRO-H200", serialNumber: "2300975", ampId: "1-51" }
  ],
  primaryInjectionTestSet: [
    { name: "Megger DD-A", serialNumber: "202411040029", ampId: "" }
  ]
};

// Normalize imported trip unit type; allow free text, only coerce common N/A variants
const normalizeTripUnitType = (value: any): string => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  // Coerce common N/A spellings to a single representation
  if (/^n\s*[\/\u2044]?\s*a$/i.test(raw)) return 'N/A';
  return raw; // Preserve user-entered free text
};

interface FormData {
  // Job Information
  customer: string;
  address: string;
  user: string; // Added based on image
  date: string;
  identifier: string; // Added based on image
  jobNumber: string;
  technicians: string;
  temperature: {
    fahrenheit: number;
    celsius: number;
    tcf: number;
    humidity: number; // Added based on image
  };
  substation: string; // Added based on image
  eqptLocation: string; // Added based on image

  // Nameplate Data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  type: string;
  frameSize: string; // Added based on image (A)
  icRating: string; // Added based on image (kA)
  tripUnitType: string; // Use tripUnitTypeOptions
  ratingPlug: string; // Added based on image (A)
  curveNo: string; // Added based on image
  chargeMotorVoltage: string; // Added based on image
  operation: string; // Added based on image
  mounting: string; // Added based on image
  zoneInterlock: string; // Added based on image
  thermalMemory: string; // Added based on image

  // Visual and Mechanical Inspection
  visualInspectionItems: {
    id: string; // NETA Section
    description: string;
    result: string; // Dropdown: Y, N, N/A
  }[];

  // Device Settings
  deviceSettings: {
    asFound: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    asLeft: {
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
  };

  // Electrical Tests - Contact/Pole Resistance
  contactResistance: {
    p1: string;
    p2: string;
    p3: string;
    unit: string; // Dropdown: µΩ, mΩ, Ω
  };

  // Electrical Tests - Insulation Resistance
  insulationResistance: {
    testVoltage: string; // Dropdown: 1000V, etc.
    unit: string; // Dropdown: MΩ, kΩ
    measured: {
      poleToPole: { p1p2: string; p2p3: string; p3p1: string; };
      poleToFrame: { p1: string; p2: string; p3: string; };
      lineToLoad: { p1: string; p2: string; p3: string; };
    };
    corrected: {
      poleToPole: { p1p2: string; p2p3: string; p3p1: string; };
      poleToFrame: { p1: string; p2: string; p3: string; };
      lineToLoad: { p1: string; p2: string; p3: string; };
    };
  };

  // Electrical Tests - Primary Injection (Replaced Trip Testing)
  primaryInjection: {
    testedSettings: { // Reuse testedSettings structure for the top table
      longTime: { setting: string; delay: string; i2t: string };
      shortTime: { setting: string; delay: string; i2t: string };
      instantaneous: { setting: string; delay: string; i2t: string };
      groundFault: { setting: string; delay: string; i2t: string };
    };
    results: { // Updated structure for the exact layout provided
      longTime: { 
        ratedAmperes1: string; 
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
      shortTime: { 
        ratedAmperes1: string;
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
      instantaneous: { 
        ratedAmperes1: string;
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
      groundFault: { 
        ratedAmperes1: string;
        ratedAmperes2: string;
        multiplier: string; 
        toleranceMin: string; 
        toleranceMax: string;
        testAmperes1: string;
        testAmperes2: string;
        toleranceMin1: string;
        toleranceMin2: string;
        toleranceMax1: string;
        toleranceMax2: string;
        pole1: { sec: string; a: string }; 
        pole2: { sec: string; a: string }; 
        pole3: { sec: string; a: string }; 
      };
    };
  };

  // Test Equipment Used
  testEquipment: {
    megohmmeter: { name: string; serialNumber: string; ampId: string; calDate: string };
    lowResistanceOhmmeter: { name: string; serialNumber: string; ampId: string; calDate: string };
    primaryInjectionTestSet: { name: string; serialNumber: string; ampId: string; calDate: string }; // Changed from secondary
  };

  // Comments
  comments: string;

  // Status (PASS/FAIL) - Added based on standard report structure
  status: string;

  // Counter Reading
  counterReading: {
    asFound: string;
    asLeft: string;
  };
}

// Define tableStyles based on MediumVoltageSwitchOilReport.tsx
const tableStyles = {
  container: "w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700",
  table: "w-full min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700",
  headerCell: "px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider whitespace-normal",
  cell: "px-2 py-1 text-sm text-gray-900 dark:text-white whitespace-normal",
  input: "w-full text-sm py-1 rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white",
  select: "w-full text-sm py-1 rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white"
};

// Searchable Equipment Dropdown Component
interface EquipmentDropdownProps {
  value: string;
  onChange: (value: string) => void;
  onSerialChange: (value: string) => void;
  onAmpIdChange: (value: string) => void;
  options: { name: string; serialNumber: string; ampId: string }[];
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

const EquipmentDropdown: React.FC<EquipmentDropdownProps> = ({
  value,
  onChange,
  onSerialChange,
  onAmpIdChange,
  options,
  placeholder = "Type or select equipment...",
  readOnly = false,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.ampId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle selection
  const handleSelect = (option: { name: string; serialNumber: string; ampId: string }) => {
    const displayValue = `${option.name}; SER# ${option.serialNumber}${option.ampId ? `, AMP ID: ${option.ampId}` : ''}`;
    setSearchTerm(displayValue);
    onChange(option.name);
    onSerialChange(option.serialNumber);
    onAmpIdChange(option.ampId);
    setIsOpen(false);
  };

  // Handle manual input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    onChange(newValue);
    setIsOpen(newValue.length > 0 && filteredOptions.length > 0);
  };

  // Update search term when value changes externally
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (readOnly) {
    return (
      <input
        type="text"
        value={searchTerm}
        readOnly
        className={`form-input bg-gray-100 dark:bg-dark-150 ${className}`}
      />
    );
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(filteredOptions.length > 0)}
        placeholder={placeholder}
        className="form-input w-full"
      />
      
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-150 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredOptions.map((option, index) => (
            <div
              key={index}
              onClick={() => handleSelect(option)}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-100 text-sm"
            >
              <div className="font-medium text-gray-900 dark:text-white">{option.name}</div>
              <div className="text-gray-500 dark:text-gray-400">
                SER# {option.serialNumber}{option.ampId && `, AMP ID: ${option.ampId}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Rename component
const LowVoltageCircuitBreakerElectronicTripMTSReport: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();
  
  // Check if we're in print mode
  const isPrintMode = searchParams.get('print') === 'true';
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'low-voltage-circuit-breaker-electronic-trip-mts-report';
  const reportName = getReportName(reportSlug);
  
  // State management
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const [isEditing, setIsEditing] = useState<boolean>(!initialReportId);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const [formData, setFormData] = useState<FormData>({
    // Job Information
    customer: '',
    address: '',
    user: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: {
      fahrenheit: 68,
      celsius: 20,
      tcf: 1,
      humidity: 50
    },
    substation: '',
    eqptLocation: '',

    // Nameplate Data
    manufacturer: '',
    catalogNumber: '',
    serialNumber: '',
    type: '',
    frameSize: '',
    icRating: '',
    tripUnitType: '',
    ratingPlug: '',
    curveNo: '',
    chargeMotorVoltage: '',
    operation: '',
    mounting: '',
    zoneInterlock: '',
    thermalMemory: '',

    // Visual and Mechanical Inspection
    visualInspectionItems: [
      { id: '7.6.1.2.A.1', description: 'Inspect physical and mechanical condition.', result: '' },
      { id: '7.6.1.2.A.2', description: 'Inspect anchorage, alignment, and grounding.', result: '' },
      { id: '7.6.1.2.A.3', description: 'Verify that all maintenance devices are available for servicing and operating the breaker.', result: '' },
      { id: '7.6.1.2.A.5', description: 'Clean the unit.', result: '' },
      { id: '7.6.1.2.A.6', description: 'Inspect arc chutes.', result: '' },
      { id: '7.6.1.2.A.7', description: 'Inspect moving and stationary contacts for condition, wear, and alignment.', result: '' },
      { id: '7.6.1.2.A.8', description: 'Verify that primary and secondary contact wipe and other dimensions vital to satisfactory operation of the breaker are in accordance with manufacturer\'s published data.', result: '' },
      { id: '7.6.1.2.A.9', description: 'Perform all mechanical operator and contact alignment tests on both the breaker and its operating mechanism in accordance with manufacturer\'s published data.', result: '' },
      { id: '7.6.1.2.A.10.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.6.1.2.B.1.', result: '' },
      { id: '7.6.1.2.A.11', description: 'Verify cell fit and element alignment.', result: '' },
      { id: '7.6.1.2.A.12', description: 'Verify racking mechanism operation.', result: '' },
      { id: '7.6.1.2.A.13', description: 'Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: '' },
      { id: '7.6.1.2.A.14', description: 'Perform adjustments for final protective device settings in accordance with coordination study provided by end user.', result: '' }
    ],

    // Device Settings
    deviceSettings: {
      asFound: {
        longTime: { setting: '', delay: '', i2t: '' },
        shortTime: { setting: '', delay: '', i2t: '' },
        instantaneous: { setting: '', delay: '', i2t: '' },
        groundFault: { setting: '', delay: '', i2t: '' }
      },
      asLeft: {
        longTime: { setting: '', delay: '', i2t: '' },
        shortTime: { setting: '', delay: '', i2t: '' },
        instantaneous: { setting: '', delay: '', i2t: '' },
        groundFault: { setting: '', delay: '', i2t: '' }
      }
    },

    // Electrical Tests - Contact/Pole Resistance
    contactResistance: {
      p1: '',
      p2: '',
      p3: '',
      unit: 'µΩ'
    },

    // Electrical Tests - Insulation Resistance
    insulationResistance: {
      testVoltage: '1000V',
      unit: 'MΩ',
      measured: {
        poleToPole: { p1p2: '', p2p3: '', p3p1: '' },
        poleToFrame: { p1: '', p2: '', p3: '' },
        lineToLoad: { p1: '', p2: '', p3: '' }
      },
      corrected: {
        poleToPole: { p1p2: '', p2p3: '', p3p1: '' },
        poleToFrame: { p1: '', p2: '', p3: '' },
        lineToLoad: { p1: '', p2: '', p3: '' }
      }
    },

    // Electrical Tests - Primary Injection
    primaryInjection: {
      testedSettings: {
        longTime: { setting: '', delay: '', i2t: '' },
        shortTime: { setting: '', delay: '', i2t: '' },
        instantaneous: { setting: '', delay: '', i2t: '' },
        groundFault: { setting: '', delay: '', i2t: '' }
      },
      results: {
        longTime: {
          ratedAmperes1: '', ratedAmperes2: '', multiplier: '300%', toleranceMin: '-10%', toleranceMax: '10%',
          testAmperes1: '', testAmperes2: '', toleranceMin1: '', toleranceMin2: '', toleranceMax1: '', toleranceMax2: '',
          pole1: { sec: '', a: '' }, pole2: { sec: '', a: '' }, pole3: { sec: '', a: '' }
        },
        shortTime: {
          ratedAmperes1: '', ratedAmperes2: '', multiplier: '110%', toleranceMin: '-10%', toleranceMax: '10%',
          testAmperes1: '', testAmperes2: '', toleranceMin1: '', toleranceMin2: '', toleranceMax1: '', toleranceMax2: '',
          pole1: { sec: '', a: '' }, pole2: { sec: '', a: '' }, pole3: { sec: '', a: '' }
        },
        instantaneous: {
          ratedAmperes1: '', ratedAmperes2: '', multiplier: '', toleranceMin: '-20%', toleranceMax: '20%',
          testAmperes1: '', testAmperes2: '', toleranceMin1: '', toleranceMin2: '', toleranceMax1: '', toleranceMax2: '',
          pole1: { sec: '', a: '' }, pole2: { sec: '', a: '' }, pole3: { sec: '', a: '' }
        },
        groundFault: {
          ratedAmperes1: '', ratedAmperes2: '', multiplier: '110%', toleranceMin: '-15%', toleranceMax: '15%',
          testAmperes1: '', testAmperes2: '', toleranceMin1: '', toleranceMin2: '', toleranceMax1: '', toleranceMax2: '',
          pole1: { sec: '', a: '' }, pole2: { sec: '', a: '' }, pole3: { sec: '', a: '' }
        }
      }
    },

    // Test Equipment Used
    testEquipment: {
      megohmmeter: { name: '', serialNumber: '', ampId: '', calDate: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '', calDate: '' },
      primaryInjectionTestSet: { name: '', serialNumber: '', ampId: '', calDate: '' }
    },

    // Comments
    comments: '',

    // Status
    status: 'PASS',

    // Counter Reading
    counterReading: {
      asFound: '',
      asLeft: ''
    }
  });

  // --- Load Job Info (from PanelboardReport) ---
  const loadJobInfo = async () => {
    if (!jobId) return;

    try {
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select(`
          title,
          job_number,
          customer_id,
          site_address
        `)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      if (jobData) {
        let customerName = '';
        let customerAddress = (jobData as any).site_address || '';

        if (jobData.customer_id) {
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
            customerName = customerData.company_name || customerData.name || '';
            if (!customerAddress) customerAddress = customerData.address || '';
          }
        }

        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: maskCustomerName(customerName), // Use "customer" field in FormData
          address: maskCustomerAddress(customerAddress), // Use "address" field in FormData
          // We might need jobTitle later, keep it in mind
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      alert(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      if (!currentReportId) {
        setLoading(false); // Only stop loading if it's a new report
      }
    }
  };

  // --- Load Report ---
  const loadReport = async () => {
    if (!currentReportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    // Don't reload if we just created the report via autosave
    if (isAutoSaveCreatedRef.current) {
      isAutoSaveCreatedRef.current = false;
      setLoading(false);
      return;
    }

    try {
      // First try loading from normalized JSONB store
      const { data: generic, error: gErr } = await supabase
        .schema('neta_ops')
        .from('low_voltage_cable_test_3sets')
        .select('*')
        .eq('id', currentReportId)
        .single();

      if (generic && generic.data) {
        const d: any = generic.data;
        setFormData(prev => ({
          ...prev,
          // Job info
          customer: d.reportInfo?.customer ?? prev.customer,
          address: d.reportInfo?.address ?? prev.address,
          user: d.reportInfo?.userName ?? prev.user,
          date: d.reportInfo?.date ?? prev.date,
          identifier: d.reportInfo?.identifier ?? prev.identifier,
          jobNumber: d.reportInfo?.jobNumber ?? prev.jobNumber,
          technicians: d.reportInfo?.technicians ?? prev.technicians,
          temperature: {
            ...prev.temperature,
            fahrenheit: d.reportInfo?.temperature?.fahrenheit ?? prev.temperature.fahrenheit,
            celsius: d.reportInfo?.temperature?.celsius ?? prev.temperature.celsius,
            tcf: d.reportInfo?.temperature?.tcf ?? prev.temperature.tcf,
            humidity: d.reportInfo?.temperature?.humidity ?? prev.temperature.humidity,
          },
          substation: d.reportInfo?.substation ?? prev.substation,
          eqptLocation: d.reportInfo?.eqptLocation ?? prev.eqptLocation,

          // Nameplate
          manufacturer: d.nameplateData?.manufacturer ?? prev.manufacturer,
          catalogNumber: d.nameplateData?.catalogNumber ?? prev.catalogNumber,
          serialNumber: d.nameplateData?.serialNumber ?? prev.serialNumber,
          type: d.nameplateData?.type ?? prev.type,
          frameSize: d.nameplateData?.frameSize ?? prev.frameSize,
          icRating: d.nameplateData?.icRating ?? prev.icRating,
          tripUnitType: normalizeTripUnitType(d.nameplateData?.tripUnitType) || prev.tripUnitType,
          ratingPlug: d.nameplateData?.ratingPlug ?? prev.ratingPlug,
          curveNo: d.nameplateData?.curveNo ?? prev.curveNo,
          chargeMotorVoltage: d.nameplateData?.chargeMotorVoltage ?? prev.chargeMotorVoltage,
          operation: d.nameplateData?.operation ?? prev.operation,
          mounting: d.nameplateData?.mounting ?? prev.mounting,
          zoneInterlock: d.nameplateData?.zoneInterlock ?? prev.zoneInterlock,
          thermalMemory: d.nameplateData?.thermalMemory ?? prev.thermalMemory,

          // Visual / Mechanical
          visualInspectionItems: d.visualMechanical?.items || prev.visualInspectionItems,

          // Device settings
          deviceSettings: d.deviceSettings ?? prev.deviceSettings,

          // Contact resistance
          contactResistance: d.contactResistance ?? prev.contactResistance,

          // Insulation resistance
          insulationResistance: d.insulationResistance ?? prev.insulationResistance,

          // Primary injection
          primaryInjection: d.primaryInjection ? {
            ...prev.primaryInjection,
            testedSettings: {
              longTime: { ...prev.primaryInjection.testedSettings.longTime, ...(d.primaryInjection.testedSettings?.longTime || {}) },
              shortTime: { ...prev.primaryInjection.testedSettings.shortTime, ...(d.primaryInjection.testedSettings?.shortTime || {}) },
              instantaneous: { ...prev.primaryInjection.testedSettings.instantaneous, ...(d.primaryInjection.testedSettings?.instantaneous || {}) },
              groundFault: { ...prev.primaryInjection.testedSettings.groundFault, ...(d.primaryInjection.testedSettings?.groundFault || {}) },
            },
            results: {
              longTime: { ...prev.primaryInjection.results.longTime, ...(d.primaryInjection.results?.longTime || {}) },
              shortTime: { ...prev.primaryInjection.results.shortTime, ...(d.primaryInjection.results?.shortTime || {}) },
              instantaneous: { ...prev.primaryInjection.results.instantaneous, ...(d.primaryInjection.results?.instantaneous || {}) },
              groundFault: { ...prev.primaryInjection.results.groundFault, ...(d.primaryInjection.results?.groundFault || {}) },
            }
          } : prev.primaryInjection,

          // Test equipment
          testEquipment: {
            megohmmeter: { ...prev.testEquipment.megohmmeter, ...(d.testEquipment?.megohmmeter || {}) },
            lowResistanceOhmmeter: { ...prev.testEquipment.lowResistanceOhmmeter, ...(d.testEquipment?.lowResistanceOhmmeter || {}) },
            primaryInjectionTestSet: { ...prev.testEquipment.primaryInjectionTestSet, ...(d.testEquipment?.primaryInjectionTestSet || {}) },
          },

          // Comments & status
          comments: d.comments ?? prev.comments,
          status: d.reportInfo?.status ?? prev.status,
        }));
        setIsEditing(false);
        setLoading(false);
        return;
      }

      // Fallback to dedicated table
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_circuit_breaker_electronic_trip_mts') // Use new table name
        .select('*')
        .eq('id', currentReportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`Report with ID ${currentReportId} not found. Starting new report.`);
          setIsEditing(true);
        } else {
          throw error;
        }
      }

      if (data) {
        // Map loaded data to formData state, ensuring all fields exist
        setFormData(prev => ({
          ...prev, // Start with defaults to ensure all keys exist
          // Job Info (potentially from report_info)
          customer: data.report_info?.customer || prev.customer,
          address: data.report_info?.address || prev.address,
          user: data.report_info?.user || prev.user,
          date: data.report_info?.date || prev.date,
          identifier: data.report_info?.identifier || prev.identifier,
          jobNumber: data.report_info?.jobNumber || prev.jobNumber,
          technicians: data.report_info?.technicians || prev.technicians,
          temperature: data.report_info?.temperature || prev.temperature,
          substation: data.report_info?.substation || prev.substation,
          eqptLocation: data.report_info?.eqptLocation || prev.eqptLocation,

          // Nameplate Data
          manufacturer: data.nameplate_data?.manufacturer || '',
          catalogNumber: data.nameplate_data?.catalogNumber || '',
          serialNumber: data.nameplate_data?.serialNumber || '',
          type: data.nameplate_data?.type || '',
          frameSize: data.nameplate_data?.frameSize || '',
          icRating: data.nameplate_data?.icRating || '',
          tripUnitType: normalizeTripUnitType(data.nameplate_data?.tripUnitType || ''),
          ratingPlug: data.nameplate_data?.ratingPlug || '',
          curveNo: data.nameplate_data?.curveNo || '',
          chargeMotorVoltage: data.nameplate_data?.chargeMotorVoltage || '',
          operation: data.nameplate_data?.operation || '',
          mounting: data.nameplate_data?.mounting || '',
          zoneInterlock: data.nameplate_data?.zoneInterlock || '',
          thermalMemory: data.nameplate_data?.thermalMemory || '',

          // Visual and Mechanical Inspection
          visualInspectionItems: data.visual_mechanical?.items || prev.visualInspectionItems,

          // Device Settings
          deviceSettings: data.device_settings || prev.deviceSettings,

          // Electrical Tests - Contact/Pole Resistance
          contactResistance: data.contact_resistance || prev.contactResistance,

          // Electrical Tests - Insulation Resistance
          insulationResistance: data.insulation_resistance || prev.insulationResistance,

          // Electrical Tests - Primary Injection
          primaryInjection: data.primary_injection || prev.primaryInjection, // Changed from trip_testing

          // Test Equipment Used
          testEquipment: data.test_equipment || prev.testEquipment,

          // Comments
          comments: data.comments || '',

          // Status - Use equipmentEvaluationResultOptions
          status: data.report_info?.status || 'PASS',
        }));
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true); // Allow editing if loading fails
    } finally {
      setLoading(false);
    }
  };

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const normalized = {
      reportInfo: {
        customer: maskCustomerName(formData.customer),
        address: maskCustomerAddress(formData.address),
        userName: formData.user,
        date: formData.date,
        identifier: formData.identifier,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        status: formData.status,
      },
      nameplateData: {
        manufacturer: formData.manufacturer,
        catalogNumber: formData.catalogNumber,
        serialNumber: formData.serialNumber,
        type: formData.type,
        frameSize: formData.frameSize,
        icRating: formData.icRating,
        tripUnitType: formData.tripUnitType,
        ratingPlug: formData.ratingPlug,
        curveNo: formData.curveNo,
        chargeMotorVoltage: formData.chargeMotorVoltage,
        operation: formData.operation,
        mounting: formData.mounting,
        zoneInterlock: formData.zoneInterlock,
        thermalMemory: formData.thermalMemory,
      },
      visualMechanical: { items: formData.visualInspectionItems },
      deviceSettings: formData.deviceSettings,
      contactResistance: formData.contactResistance,
      insulationResistance: formData.insulationResistance,
      primaryInjection: formData.primaryInjection,
      testEquipment: formData.testEquipment,
      comments: formData.comments,
      reportType: reportSlug,
    };
    const insertPayload = { job_id: jobId, user_id: user.id, data: normalized };
    const updatePayload = { data: normalized };

    try {
      setIsAutoSaving(true);

      if (currentReportId) {
        // Update existing report
        await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .update(updatePayload)
          .eq('id', currentReportId);
      } else {
        // Create new report
        const result = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .insert(insertPayload)
          .select()
          .maybeSingle();

        let newReportId = result.data?.id;
        if (!result.error && !newReportId) {
          const { data: fetched } = await supabase
            .schema('neta_ops')
            .from('low_voltage_cable_test_3sets')
            .select('id')
            .eq('job_id', jobId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          newReportId = fetched?.id;
        }

        if (newReportId) {
          // Create asset entry
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || ''),
            file_url: `report:/jobs/${jobId}/${reportSlug}/${newReportId}`,
            user_id: user.id
          };

          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();

          if (!assetError) {
            // Link asset to job
            await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user.id
              });
          }

          // Update state and URL
          setCurrentReportId(newReportId);
          isAutoSaveCreatedRef.current = true;
          window.history.replaceState({}, '', `/jobs/${jobId}/${reportSlug}/${newReportId}`);
        }
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [jobId, user?.id, currentReportId, formData, reportSlug]);

  // --- Save Report ---
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    // Structure data for Supabase JSONB columns
    const normalized = {
      reportInfo: {
        customer: maskCustomerName(formData.customer),
        address: maskCustomerAddress(formData.address),
        userName: formData.user,
        date: formData.date,
        identifier: formData.identifier,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        status: formData.status,
      },
      nameplateData: {
        manufacturer: formData.manufacturer,
        catalogNumber: formData.catalogNumber,
        serialNumber: formData.serialNumber,
        type: formData.type,
        frameSize: formData.frameSize,
        icRating: formData.icRating,
        tripUnitType: formData.tripUnitType,
        ratingPlug: formData.ratingPlug,
        curveNo: formData.curveNo,
        chargeMotorVoltage: formData.chargeMotorVoltage,
        operation: formData.operation,
        mounting: formData.mounting,
        zoneInterlock: formData.zoneInterlock,
        thermalMemory: formData.thermalMemory,
      },
      visualMechanical: { items: formData.visualInspectionItems },
      deviceSettings: formData.deviceSettings,
      contactResistance: formData.contactResistance,
      insulationResistance: formData.insulationResistance,
      primaryInjection: formData.primaryInjection,
      testEquipment: formData.testEquipment,
      comments: formData.comments,
      reportType: reportSlug,
    };
    const insertPayload = { job_id: jobId, user_id: user.id, data: normalized };
    const updatePayload = { data: normalized };
    console.log('Saving MTS report to low_voltage_cable_test_3sets:', { currentReportId, insertPayload, updatePayload });

    try {
      let result;
      if (currentReportId) {
        // Update existing report in normalized store
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .update(updatePayload)
          .eq('id', currentReportId)
          .select()
          .maybeSingle();
      } else {
        // Create new report in normalized store
        result = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .insert(insertPayload)
          .select()
          .maybeSingle();

        // Create asset entry for the new report
        let newReportId = result.data?.id;
        if (!result.error && !newReportId) {
          const { data: fetched } = await supabase
            .schema('neta_ops')
            .from('low_voltage_cable_test_3sets')
            .select('id')
            .eq('job_id', jobId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          newReportId = fetched?.id;
        }
        if (newReportId) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/${reportSlug}/${newReportId}`,
            user_id: user.id
          };

          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .maybeSingle();

          if (assetError) throw assetError;

          // Link asset to job
          if (assetResult?.id) {
            await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({
                job_id: jobId,
                asset_id: assetResult.id,
                user_id: user.id
              });
          }
        }
      }

      if (result.error) throw result.error;

      // If update affected zero rows (possibly due to RLS), attempt owner-agnostic update via RPC or upsert as a fallback
      if (currentReportId && (!result.data || (Array.isArray(result.data) && result.data.length === 0))) {
        console.warn('Update returned no rows. Possible RLS on row owner. Attempting upsert as fallback...');
        const fallback = await supabase
          .schema('neta_ops')
          .from('low_voltage_cable_test_3sets')
          .upsert({ id: currentReportId, job_id: jobId, user_id: user.id, data: normalized }, { onConflict: 'id' })
          .select()
          .maybeSingle();
        if (fallback.error) {
          console.error('Upsert fallback failed:', fallback.error);
          throw fallback.error;
        }
      }

      setIsEditing(false); // Exit editing mode
      navigateAfterSave(navigate, jobId, location);
      navigateAfterSave(navigate, jobId, location); // Use utility function
    } catch (error: any) {
      console.error('Error saving report:', error);
      // Provide more specific error details if available
      let errorMessage = 'Unknown error';
      if (error) {
        if (error.message) {
          errorMessage = error.message;
        }
        if (error.details) {
          errorMessage += ` Details: ${error.details}`;
        }
        if (error.hint) {
          errorMessage += ` Hint: ${error.hint}`;
        }
      }
      alert(`Failed to save report: ${errorMessage}`);
    }
  };


  // --- useEffect for loading data ---
  useEffect(() => {
    if (jobId) {
      loadJobInfo(); // Load job info regardless
    }
    if (currentReportId) {
      loadReport(); // Load existing report if currentReportId exists
    } else {
      setLoading(false); // If no currentReportId, stop loading (new report)
      setIsEditing(true); // Start in edit mode for new reports
    }
  }, [jobId, currentReportId]); // Dependencies

  // Auto-save effect with debounce
  useEffect(() => {
    if (!isEditing || loading) return;
    
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
  }, [formData, isEditing, loading, autoSave]);

  // --- Temperature Handlers (from PanelboardReport) ---
  const handleFahrenheitChange = (fahrenheit: number) => {
    const calculatedCelsius = ((fahrenheit - 32) * 5) / 9;
    const roundedCelsius = Math.round(calculatedCelsius);
    const tcf = getTCF(roundedCelsius);

    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit,
        celsius: roundedCelsius,
        tcf
      }
    }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const roundedCelsius = Math.round(celsius);
    const calculatedFahrenheit = (roundedCelsius * 9) / 5 + 32;
    const roundedFahrenheit = Math.round(calculatedFahrenheit);
    const tcf = getTCF(roundedCelsius);

    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        celsius: roundedCelsius,
        fahrenheit: roundedFahrenheit,
        tcf
      }
    }));
  };

  // --- Insulation Resistance Calculation ---
  // Calculate temperature corrected values whenever measured values or temperature changes
  useEffect(() => {
    console.log('Temperature correction useEffect triggered:', { isEditing, tcf: formData.temperature.tcf });
    if (!isEditing) {
      console.log('Not in edit mode, skipping temperature correction');
      return; // Only calculate in edit mode
    }

    const calculateCorrectedValue = (value: string): string => {
      console.log('calculateCorrectedValue called with:', value);
      if (value === "" || value === null || value === undefined) {
          console.log('Empty value, returning empty string');
          return "";
      }
      
      // Check if the value contains non-numeric characters (like >, <, N/A, etc.)
      const trimmedValue = value.toString().trim();
      const numericValue = parseFloat(trimmedValue);
      console.log('Parsed values:', { trimmedValue, numericValue, isNaN: isNaN(numericValue) });
      
      // If it contains any non-numeric characters OR is not a pure number, return original unchanged
      if (isNaN(numericValue) || trimmedValue !== numericValue.toString()) {
        console.log('Contains symbols/letters or not pure number, returning original:', trimmedValue);
        return trimmedValue; // Return original value for >2200, <500, N/A, etc.
      }
      
      // Only apply TCF to pure numbers
      const tcf = formData.temperature.tcf;
      // Handle cases where tcf might be zero or invalid
      if (!tcf || tcf === 0) return numericValue.toFixed(2);
      
      console.log('Pure number, applying TCF:', { numericValue, tcf, result: (numericValue * tcf).toFixed(2) });
      return (numericValue * tcf).toFixed(2);
    };

    const newCorrected = {
      poleToPole: {
        p1p2: calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p1p2),
        p2p3: calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p2p3),
        p3p1: calculateCorrectedValue(formData.insulationResistance.measured.poleToPole.p3p1),
      },
      poleToFrame: {
        p1: calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p1),
        p2: calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p2),
        p3: calculateCorrectedValue(formData.insulationResistance.measured.poleToFrame.p3),
      },
      lineToLoad: {
        p1: calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p1),
        p2: calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p2),
        p3: calculateCorrectedValue(formData.insulationResistance.measured.lineToLoad.p3),
      }
    };

    setFormData(prev => ({
      ...prev,
      insulationResistance: {
        ...prev.insulationResistance,
        corrected: newCorrected
      }
    }));

  }, [
    JSON.stringify(formData.insulationResistance.measured), // Stringify to detect deep changes
    formData.temperature.tcf, // TCF changes should also trigger recalculation
    isEditing // Only calculate when in edit mode
  ]);


  // --- Generic Handle Change ---
  // Use lodash set for deeply nested updates
  const handleChange = (path: string, value: any) => {
    if (!isEditing) return;
    
    setFormData(prev => {
      const newState = { ...prev };
      const keys = path.split('.');
      let currentLevel: any = newState;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        // Check if the key includes an index (e.g., "visualInspectionItems[0]")
        const match = key.match(/(\w+)\[(\d+)\]/);
        if (match) {
          const arrayKey = match[1];
          const index = parseInt(match[2], 10);
          if (!currentLevel[arrayKey]) currentLevel[arrayKey] = []; // Ensure array exists
          if (!currentLevel[arrayKey][index]) currentLevel[arrayKey][index] = {}; // Ensure object at index exists
          currentLevel = currentLevel[arrayKey][index];
        } else {
          if (!currentLevel[key]) currentLevel[key] = {}; // Ensure object exists
          currentLevel = currentLevel[key];
        }
      }
      currentLevel[keys[keys.length - 1]] = value;

      // Check if this is a field that should trigger recalculation
      const shouldRecalculate = path.includes('ratedAmperes1') || 
                               path.includes('multiplier') || 
                               path.includes('toleranceMin') || 
                               path.includes('toleranceMax');

      if (shouldRecalculate && path.includes('primaryInjection.results')) {
        const section = path.includes('longTime') ? 'longTime' 
                     : path.includes('shortTime') ? 'shortTime'
                     : path.includes('instantaneous') ? 'instantaneous'
                     : 'groundFault';
        
        // Get the section data after the current update
        const sectionResults = newState.primaryInjection.results[section];
        if (sectionResults && sectionResults.ratedAmperes1) {
          const calculated = calculateTestValuesWithFormData(sectionResults.ratedAmperes1, section, sectionResults);
          if (calculated) {
            sectionResults.testAmperes1 = calculated.testAmperes1;
            sectionResults.testAmperes2 = calculated.testAmperes2;
            sectionResults.toleranceMin2 = calculated.toleranceMin2;
            sectionResults.toleranceMax2 = calculated.toleranceMax2;
          }
        }
      }

      return newState;
    });
  };

  // Add calculation function (legacy - uses hardcoded values)
  const calculateTestValues = (ratedAmperes: string, section: 'longTime' | 'shortTime' | 'instantaneous' | 'groundFault') => {
    if (!ratedAmperes || isNaN(Number(ratedAmperes))) return null;
    
    const value = Number(ratedAmperes);
    const multipliers = {
      longTime: { test: 3.0, tolerance: 0.10 }, // 300%, ±10%
      shortTime: { test: 1.1, tolerance: 0.10 }, // 110%, ±10%
      instantaneous: { test: 1.0, tolerance: 0.20 }, // 100%, ±20%
      groundFault: { test: 1.1, tolerance: 0.15 }, // 110%, ±15%
    };

    const mult = multipliers[section];
    
    return {
      testAmperes1: section === 'instantaneous' ? '' : (value * mult.test).toFixed(1),
      testAmperes2: value.toString(),
      toleranceMin2: (value * (1 - mult.tolerance)).toFixed(1),
      toleranceMax2: (value * (1 + mult.tolerance)).toFixed(1)
    };
  };

  // New calculation function that uses actual form data
  const calculateTestValuesWithFormData = (ratedAmperes: string, section: 'longTime' | 'shortTime' | 'instantaneous' | 'groundFault', sectionData: any) => {
    if (!ratedAmperes || isNaN(Number(ratedAmperes))) return null;
    
    const value = Number(ratedAmperes);
    
    // Parse multiplier from form data (e.g., "300%" -> 3.0)
    const multiplierStr = sectionData.multiplier || '';
    const multiplierNum = parseFloat(multiplierStr.replace('%', '')) / 100;
    
    // Parse tolerance values from form data - handle both positive and negative
    // e.g., "-10%" -> -0.10, "5%" -> 0.05, "+5%" -> 0.05, "5" -> 5.0
    const toleranceMinStr = sectionData.toleranceMin || '';
    const toleranceMaxStr = sectionData.toleranceMax || '';
    
    // Smart parsing: always treat as percentage (whether % sign is present or not)
    const parseToleranceValue = (str: string): number => {
      const cleanStr = str.replace(/\+/g, '').replace(/%/g, '').trim(); // Remove + and % signs
      const numValue = parseFloat(cleanStr);
      // Always convert to decimal (5 becomes 0.05, meaning 5%)
      return isNaN(numValue) ? 0 : numValue / 100;
    };
    
    const toleranceMinNum = parseToleranceValue(toleranceMinStr);
    const toleranceMaxNum = parseToleranceValue(toleranceMaxStr);
    
    // Use form values if available, otherwise fall back to defaults
    const testMultiplier = !isNaN(multiplierNum) ? multiplierNum : 
                          section === 'longTime' ? 3.0 :
                          section === 'shortTime' ? 1.1 :
                          section === 'instantaneous' ? 1.0 : 1.1;
                          
    const toleranceMin = !isNaN(toleranceMinNum) ? toleranceMinNum :
                        section === 'instantaneous' ? -0.20 :
                        section === 'groundFault' ? -0.15 : -0.10;
                        
    const toleranceMax = !isNaN(toleranceMaxNum) ? toleranceMaxNum :
                        section === 'instantaneous' ? 0.20 :
                        section === 'groundFault' ? 0.15 : 0.10;
    
    // Debug logging to help identify the issue
    console.log(`Tolerance calculation for ${section}:`, {
      value,
      toleranceMinStr,
      toleranceMaxStr,
      toleranceMin,
      toleranceMax,
      calculatedMin: (value * (1 + toleranceMin)).toFixed(1),
      calculatedMax: (value * (1 + toleranceMax)).toFixed(1)
    });
    
    return {
      testAmperes1: section === 'instantaneous' ? '' : (value * testMultiplier).toFixed(1),
      testAmperes2: value.toString(),
      toleranceMin2: (value * (1 + toleranceMin)).toFixed(1),
      toleranceMax2: (value * (1 + toleranceMax)).toFixed(1)
    };
  };

  const primaryInjectionPrintSections = [
    { key: 'longTime', label: 'Long Time', pickupLabel: 'LTPU' },
    { key: 'shortTime', label: 'Short Time', pickupLabel: 'STPU' },
    { key: 'instantaneous', label: 'Instantaneous', pickupLabel: 'IPU' },
    { key: 'groundFault', label: 'Ground Fault', pickupLabel: 'GFPU' },
  ] as const;

  const formatPoleValue = (value: string, unit: 'sec.' | 'A') => {
    const trimmed = (value || '').trim();
    return trimmed ? `${trimmed} ${unit}` : '';
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  // --- Render Component ---
  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6 relative">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - MTS 7.6.1.2
          <div className="hidden print:block mt-2">
            <div
              className={`pass-fail-status-box ${formData.status === 'FAIL' ? 'status-fail' : formData.status === 'PASS' ? 'status-pass' : 'status-limited'}`}
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                width: 'fit-content',
                borderRadius: '6px',
                border: formData.status === 'PASS' ? '2px solid #16a34a' : formData.status === 'FAIL' ? '2px solid #dc2626' : '2px solid #ca8a04',
                backgroundColor: formData.status === 'PASS' ? '#22c55e' : formData.status === 'FAIL' ? '#ef4444' : '#eab308',
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
      
      <div className="p-6 flex justify-center">
        <div className="max-w-7xl w-full space-y-6">
                 {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden flex justify-between items-center mb-6`}>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Low Voltage Circuit Breaker Electronic Trip Unit MTS
            </h1>
           <div className="flex gap-2 items-center">
             <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
               ✓ Auto Saving Enabled
             </span>
             {/* Status Button */}
             <button
               onClick={() => {
                 if (isEditing) {
                   // Cycle through PASS -> FAIL -> LIMITED SERVICE -> PASS
                   const nextStatus = formData.status === 'PASS' ? 'FAIL' : formData.status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS';
                   setFormData(prev => ({ ...prev, status: nextStatus }));
                 }
               }}
               className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                 formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
                 formData.status === 'FAIL' ? 'bg-red-600 text-white focus:ring-red-500' :
                 'bg-yellow-500 text-black focus:ring-yellow-400' // Style for LIMITED SERVICE
               } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
             >
               {formData.status}
             </button>

             {/* Edit/Save/Print Buttons */}
             {currentReportId && !isEditing ? (
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
                 className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}
               >
                 Save Report
               </button>
             )}
           </div>
         </div>

        {/* --- Job Information Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 print:hidden">
                {/* Column 1 */}
                <div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="customer" className="form-label inline-block w-32">Customer:</label>
                        <input id="customer" type="text" value={maskCustomerName(formData.customer)} readOnly={true} className="form-input bg-gray-100 dark:bg-dark-150" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="address" className="form-label inline-block w-32">Address:</label>
                        <input id="address" type="text" value={maskCustomerAddress(formData.address)} readOnly={true} className="form-input bg-gray-100 dark:bg-dark-150" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="user" className="form-label inline-block w-32">User:</label>
                        <input id="user" type="text" value={formData.user} onChange={(e) => handleChange('user', e.target.value)} readOnly={!isEditing} className="form-input" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="date" className="form-label inline-block w-32">Date:</label>
                        <input id="date" type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditing} className="form-input" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="identifier" className="form-label inline-block w-32">Identifier:</label>
                        <input id="identifier" type="text" value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditing} className="form-input" />
                    </div>
                </div>
                {/* Column 2 */}
                <div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="jobNumber" className="form-label inline-block w-32">Job #:</label>
                        <input id="jobNumber" type="text" value={formData.jobNumber} readOnly={true} className="form-input bg-gray-100 dark:bg-dark-150" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="technicians" className="form-label inline-block w-32">Technicians:</label>
                        <input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className="form-input" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="substation" className="form-label inline-block w-32">Substation:</label>
                        <input id="substation" type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditing} className="form-input" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="eqptLocation" className="form-label inline-block w-32">Eqpt. Location:</label>
                        <input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className="form-input" />
                    </div>
                    {/* Temperature Fields */}
                    <div className="mb-4 flex items-center space-x-2">
                  <label className="form-label inline-block w-auto">Temp:</label>
                      <input type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className="form-input w-20" />
                  <span>°F</span>
                      <input type="number" value={formData.temperature.celsius} readOnly className="form-input w-20 bg-gray-100 dark:bg-dark-150" />
                  <span>°C</span>
                  <label className="form-label inline-block w-auto ml-4">TCF:</label>
                      <input type="number" value={formData.temperature.tcf} readOnly className="form-input w-24 bg-gray-100 dark:bg-dark-150" />
                    </div>
                    <div className="mb-4 flex items-center">
                  <label htmlFor="humidity" className="form-label inline-block w-32">Humidity:</label>
                        <input id="humidity" type="number" value={formData.temperature.humidity || ''} onChange={(e) => handleChange('temperature.humidity', e.target.value === '' ? null : Number(e.target.value))} readOnly={!isEditing} className="form-input w-20" />
                  <span className="ml-2">%</span>
                    </div>
                </div>
            </div>
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
          </div>

        {/* --- Nameplate Data Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 print:hidden">
              {/* Column 1 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="manufacturer" className="form-label inline-block w-32">Manufacturer:</label>
                  <input id="manufacturer" type="text" value={formData.manufacturer} onChange={(e) => handleChange('manufacturer', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="catalogNumber" className="form-label inline-block w-32">Catalog Number:</label>
                  <input id="catalogNumber" type="text" value={formData.catalogNumber} onChange={(e) => handleChange('catalogNumber', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="serialNumber" className="form-label inline-block w-32">Serial Number:</label>
                  <input id="serialNumber" type="text" value={formData.serialNumber} onChange={(e) => handleChange('serialNumber', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="type" className="form-label inline-block w-32">Type:</label>
                  <input id="type" type="text" value={formData.type} onChange={(e) => handleChange('type', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="frameSize" className="form-label inline-block w-32">Frame Size:</label>
                  <input id="frameSize" type="text" value={formData.frameSize} onChange={(e) => handleChange('frameSize', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="icRating" className="form-label inline-block w-32">IC Rating:</label>
                  <input id="icRating" type="text" value={formData.icRating} onChange={(e) => handleChange('icRating', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="tripUnitType" className="form-label inline-block w-32">Trip Unit Type:</label>
                  <input id="tripUnitType" type="text" value={formData.tripUnitType} onChange={(e) => handleChange('tripUnitType', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
              </div>
              {/* Column 2 */}
              <div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="ratingPlug" className="form-label inline-block w-32">Rating Plug:</label>
                  <input id="ratingPlug" type="text" value={formData.ratingPlug} onChange={(e) => handleChange('ratingPlug', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="curveNo" className="form-label inline-block w-32">Curve No.:</label>
                  <input id="curveNo" type="text" value={formData.curveNo} onChange={(e) => handleChange('curveNo', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="chargeMotorVoltage" className="form-label inline-block w-32">Charge Motor Voltage:</label>
                  <input id="chargeMotorVoltage" type="text" value={formData.chargeMotorVoltage} onChange={(e) => handleChange('chargeMotorVoltage', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="operation" className="form-label inline-block w-32">Operation:</label>
                  <input id="operation" type="text" value={formData.operation} onChange={(e) => handleChange('operation', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="mounting" className="form-label inline-block w-32">Mounting:</label>
                  <input id="mounting" type="text" value={formData.mounting} onChange={(e) => handleChange('mounting', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="zoneInterlock" className="form-label inline-block w-32">Zone Interlock:</label>
                  <input id="zoneInterlock" type="text" value={formData.zoneInterlock} onChange={(e) => handleChange('zoneInterlock', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
                <div className="mb-4 flex items-center">
                  <label htmlFor="thermalMemory" className="form-label inline-block w-32">Thermal Memory:</label>
                  <input id="thermalMemory" type="text" value={formData.thermalMemory} onChange={(e) => handleChange('thermalMemory', e.target.value)} readOnly={!isEditing} className="form-input flex-1" />
                </div>
              </div>
            </div>

            {/* Print-only Nameplate Data section - 2 down x 7 wide */}
            <div className="hidden print:block mt-2">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem] nameplate-print-table">
                <colgroup>
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                  <col style={{ width: '14.2857%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Manufacturer:</div><div className="mt-0">{formData.manufacturer || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Catalog No.:</div><div className="mt-0">{formData.catalogNumber || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Serial Number:</div><div className="mt-0">{formData.serialNumber || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Type:</div><div className="mt-0">{formData.type || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Frame Size (A):</div><div className="mt-0">{formData.frameSize || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">I.C. Rating (kA):</div><div className="mt-0">{formData.icRating || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Trip Unit Type:</div><div className="mt-0">{formData.tripUnitType || ''}</div></td>
                  </tr>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Rating Plug (A):</div><div className="mt-0">{formData.ratingPlug || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Curve No.:</div><div className="mt-0">{formData.curveNo || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Charge Motor V:</div><div className="mt-0">{formData.chargeMotorVoltage || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Operation:</div><div className="mt-0">{formData.operation || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Mounting:</div><div className="mt-0">{formData.mounting || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Zone Interlock:</div><div className="mt-0">{formData.zoneInterlock || ''}</div></td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border"><div className="font-semibold">Thermal Memory:</div><div className="mt-0">{formData.thermalMemory || ''}</div></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Visual and Mechanical Inspection Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600 visual-mechanical-table">
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '65%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-dark-150">
                <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">NETA Section</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white">Description</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Results</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {formData.visualInspectionItems.map((item, index) => (
                  <tr key={item.id}>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white break-words">{item.id}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">{item.description}</td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                        <div className="print:hidden">
                          <select
                            value={item.result}
                            onChange={(e) => handleChange(`visualInspectionItems[${index}].result`, e.target.value)}
                            disabled={!isEditing}
                            className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          >
                            <option value=""></option>
                            {visualInspectionResultsOptions.map(option => (
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
            </div>

          {/* --- Device Settings Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Device Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            {/* As Found Table */}
            <div>
              <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Settings As Found</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <thead className="bg-gray-50 dark:bg-dark-150">
                    <tr>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white"></th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Setting</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Delay</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">I²t</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((settingType) => (
                      <tr key={`found-${settingType}`}>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {settingType.replace('Time', ' Time').replace('Fault', ' Fault')}
                        </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asFound[settingType]?.setting || ''}
                            onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.setting`, e.target.value)}
                            readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          />
                        </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asFound[settingType]?.delay || ''}
                            onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.delay`, e.target.value)}
                            readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          />
                        </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          {settingType === 'shortTime' || settingType === 'groundFault' ? (
                            <select
                              value={formData.deviceSettings.asFound[settingType]?.i2t || ''}
                              onChange={(e) => handleChange(`deviceSettings.asFound.${settingType}.i2t`, e.target.value)}
                              disabled={!isEditing}
                                className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                            >
                              {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                            </select>
                          ) : (
                            <input
                              type="text"
                                value=""
                              readOnly
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* As Left Table */}
            <div>
              <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Settings As Left</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <thead className="bg-gray-50 dark:bg-dark-150">
                    <tr>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-sm font-medium text-gray-900 dark:text-white"></th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Setting</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Delay</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">I²t</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((settingType) => (
                      <tr key={`left-${settingType}`}>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">
                          {settingType.replace('Time', ' Time').replace('Fault', ' Fault')}
                        </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asLeft[settingType]?.setting || ''}
                            onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.setting`, e.target.value)}
                            readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          />
                        </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          <input
                            type="text"
                            value={formData.deviceSettings.asLeft[settingType]?.delay || ''}
                            onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.delay`, e.target.value)}
                            readOnly={!isEditing}
                              className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                          />
                        </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                          {settingType === 'shortTime' || settingType === 'groundFault' ? (
                            <select
                              value={formData.deviceSettings.asLeft[settingType]?.i2t || ''}
                              onChange={(e) => handleChange(`deviceSettings.asLeft.${settingType}.i2t`, e.target.value)}
                              disabled={!isEditing}
                                className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                            >
                              {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                            </select>
                          ) : (
                            <input
                              type="text"
                                value=""
                              readOnly
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </div>

        {/* --- Electrical Tests - Contact/Pole Resistance Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Contact/Pole Resistance</h2>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-dark-150">
                <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white" colSpan={3}>Contact Resistance</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">Units</th>
                </tr>
                <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">P1</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">P2</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white">P3</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm font-medium text-gray-900 dark:text-white"></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.contactResistance.p1}
                      onChange={(e) => handleChange('contactResistance.p1', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.contactResistance.p2}
                      onChange={(e) => handleChange('contactResistance.p2', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.contactResistance.p3}
                      onChange={(e) => handleChange('contactResistance.p3', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <select
                      value={formData.contactResistance.unit}
                      onChange={(e) => handleChange('contactResistance.unit', e.target.value)}
                      disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    >
                      {contactResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>

        {/* --- Electrical Tests - Insulation Resistance Section --- */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Insulation Resistance</h2>
          <div className="flex justify-end mb-4">
              <label htmlFor="insulationTestVoltage" className="form-label mr-2">Test Voltage:</label>
            <select
              id="insulationTestVoltage"
              value={formData.insulationResistance.testVoltage}
              onChange={(e) => handleChange('insulationResistance.testVoltage', e.target.value)}
              disabled={!isEditing}
                className="form-select w-32"
            >
              {insulationTestVoltageOptions.map(option => (<option key={option} value={option}>{option}</option>))}
            </select>
          </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600 ins-res-table">
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '12.5%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
              <thead className="bg-gray-50 dark:bg-dark-150">
                <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" rowSpan={2}>Pole to...</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" colSpan={3}>Measured Values</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" colSpan={3}>Temperature Corrected</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap" rowSpan={2}>Units</th>
                </tr>
                <tr>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">P1 (P1-P2)</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">P2 (P2-P3)</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">P3 (P3-P1)</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">P1 (P1-P2)</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">P2 (P2-P3)</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">P3 (P3-P1)</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {/* Pole to Pole (Closed) */}
                <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">Pole to Pole (Closed)</td>
                  {/* Measured Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.poleToPole.p1p2}
                      onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p1p2', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.poleToPole.p2p3}
                      onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p2p3', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.poleToPole.p3p1}
                      onChange={(e) => handleChange('insulationResistance.measured.poleToPole.p3p1', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                  {/* Corrected Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.poleToPole.p1p2}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.poleToPole.p2p3}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.poleToPole.p3p1}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                  {/* Units */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <select
                      value={formData.insulationResistance.unit}
                      onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                      disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    >
                      {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                    </select>
                  </td>
                </tr>
                {/* Pole to Frame (Closed) */}
                <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">Pole to Frame (Closed)</td>
                  {/* Measured Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.poleToFrame.p1}
                      onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p1', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.poleToFrame.p2}
                      onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p2', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.poleToFrame.p3}
                      onChange={(e) => handleChange('insulationResistance.measured.poleToFrame.p3', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                  {/* Corrected Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.poleToFrame.p1}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.poleToFrame.p2}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.poleToFrame.p3}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                  {/* Units */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <select
                      value={formData.insulationResistance.unit}
                      onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                      disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    >
                      {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                    </select>
                  </td>
                </tr>
                {/* Line to Load (Open) */}
                <tr>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-900 dark:text-white">Line to Load (Open)</td>
                  {/* Measured Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.lineToLoad.p1}
                      onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p1', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.lineToLoad.p2}
                      onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p2', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.measured.lineToLoad.p3}
                      onChange={(e) => handleChange('insulationResistance.measured.lineToLoad.p3', e.target.value)}
                      readOnly={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    />
                  </td>
                  {/* Corrected Values */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.lineToLoad.p1}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.lineToLoad.p2}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <input
                      type="text"
                      value={formData.insulationResistance.corrected.lineToLoad.p3}
                      readOnly
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-100 dark:bg-dark-150 text-center"
                    />
                  </td>
                  {/* Units */}
                    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center">
                    <select
                      value={formData.insulationResistance.unit}
                      onChange={(e) => handleChange('insulationResistance.unit', e.target.value)}
                      disabled={!isEditing}
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
                    >
                      {insulationResistanceUnitsOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>

        {/* --- Electrical Tests - Primary Injection Section --- */}
        <section className="mb-6 primary-injection-section">
          <div className="w-full h-1 bg-[#f26722] mb-4"></div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">
            Electrical Tests - Primary Injection
          </h2>
          
          {/* Add Tested Settings Table */}
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-2 text-center dark:text-white">Tested Settings</h3>
            <div className={tableStyles.container}>
              <table className={tableStyles.table}>
                <thead className="bg-gray-50 dark:bg-dark-150">
                  <tr>
                    <th className={tableStyles.headerCell}></th>
                    <th className={`${tableStyles.headerCell} text-center`}>Setting</th>
                    <th className={`${tableStyles.headerCell} text-center`}>Delay</th>
                    <th className={`${tableStyles.headerCell} text-center`}>I²t</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((settingType) => (
                    <tr key={`tested-${settingType}`}>
                      <td className={tableStyles.cell}>
                        {settingType.replace('Time', ' Time').replace('Fault', ' Fault')}
                      </td>
                      <td className={tableStyles.cell}>
                        <input
                          type="text"
                          value={formData.primaryInjection.testedSettings[settingType]?.setting || ''}
                          onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.setting`, e.target.value)}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center`}
                        />
                      </td>
                      <td className={tableStyles.cell}>
                        <input
                          type="text"
                          value={formData.primaryInjection.testedSettings[settingType]?.delay || ''}
                          onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.delay`, e.target.value)}
                          readOnly={!isEditing}
                          className={`${tableStyles.input} text-center`}
                        />
                      </td>
                      <td className={tableStyles.cell}>
                        {settingType === 'shortTime' || settingType === 'groundFault' ? (
                          <select
                            value={formData.primaryInjection.testedSettings[settingType]?.i2t || ''}
                            onChange={(e) => handleChange(`primaryInjection.testedSettings.${settingType}.i2t`, e.target.value)}
                            disabled={!isEditing}
                            className={tableStyles.select}
                          >
                            {tripUnitTypeOptions.map(option => (<option key={option} value={option}>{option}</option>))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value=""
                            readOnly
                            className={`${tableStyles.input} text-center bg-gray-100 dark:bg-dark-150`}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tolerance Input Section - Screen Only (Hidden in Print) */}
          <div className="mb-4 p-4 bg-gray-50 dark:bg-dark-200 rounded-lg border border-gray-300 dark:border-gray-600 no-print-tolerance-section print:hidden">
            <h3 className="text-md font-semibold mb-3 text-gray-900 dark:text-white">Tolerance Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {['longTime', 'shortTime', 'instantaneous', 'groundFault'].map((settingType) => {
                const label = settingType.replace('Time', ' Time').replace('Fault', ' Fault');
                const sectionData = formData.primaryInjection.results[settingType];
                return (
                  <div key={`tolerance-${settingType}`} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-white">{label}</label>
                    <div className="flex gap-3">
                      <div className="flex-1 min-w-[100px]">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Min %</label>
                        <input
                          type="text"
                          value={(sectionData?.toleranceMin || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange(`primaryInjection.results.${settingType}.toleranceMin`, v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className="w-full px-4 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white text-left"
                          placeholder="Min"
                          style={{ minWidth: '100px' }}
                        />
                      </div>
                      <div className="flex-1 min-w-[100px]">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Max %</label>
                        <input
                          type="text"
                          value={(sectionData?.toleranceMax || '').replace(/%/g, '')}
                          onChange={(e) => {
                            const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                            handleChange(`primaryInjection.results.${settingType}.toleranceMax`, v ? `${v}%` : '');
                          }}
                          readOnly={!isEditing}
                          className="w-full px-4 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#f26722] focus:border-[#f26722] dark:bg-dark-150 dark:text-white text-left"
                          placeholder="Max"
                          style={{ minWidth: '100px' }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative overflow-x-auto shadow-md sm:rounded-lg primary-injection-container print:hidden">
            <table className="w-full table-fixed text-sm text-left primary-injection-table">
              <colgroup>
                <col style={{ width: '9%' }} />  {/* Function */}
                <col style={{ width: '10%' }} /> {/* Rated Amperes */}
                <col style={{ width: '5%' }} />  {/* Multiplier % Left */}
                <col style={{ width: '5%' }} />  {/* Multiplier % Right */}
                <col style={{ width: '11%' }} /> {/* Test Amperes */}
                <col style={{ width: '7%' }} />  {/* Tolerance Min */}
                <col style={{ width: '7%' }} />  {/* Tolerance Max */}
                <col style={{ width: '15.33%' }} /> {/* Pole 1 */}
                <col style={{ width: '15.33%' }} /> {/* Pole 2 */}
                <col style={{ width: '15.34%' }} /> {/* Pole 3 */}
              </colgroup>
              <thead className="bg-gray-50 dark:bg-dark-150">
                <tr>
                  <th className={`${tableStyles.headerCell} text-left py-0 text-xs`} rowSpan={2}>Function</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Rated Amps.</th>
                  <th className={`${tableStyles.headerCell} text-center`} colSpan={2}>Multiplier %</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Test Amps.</th>
                  <th className={`${tableStyles.headerCell} text-center`} colSpan={2}>Tolerance</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Pole 1</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Pole 2</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Pole 3</th>
                </tr>
                <tr>
                  <th className={`${tableStyles.headerCell} text-center`}></th>
                  <th className={`${tableStyles.headerCell} text-center`}>Tol. %</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Tol. %</th>
                  <th className={`${tableStyles.headerCell} text-center`}></th>
                  <th className={`${tableStyles.headerCell} text-center`}>Min</th>
                  <th className={`${tableStyles.headerCell} text-center`}>Max</th>
                  <th className={`${tableStyles.headerCell} text-center`}></th>
                  <th className={`${tableStyles.headerCell} text-center`}></th>
                  <th className={`${tableStyles.headerCell} text-center`}></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {/* Long Time */}
                <tr>
                  <td className={`${tableStyles.cell} py-0 text-xs`} rowSpan={2}>Long Time</td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.longTime.ratedAmperes1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.longTime.ratedAmperes1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.longTime.multiplier || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.longTime.multiplier', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.longTime.testAmperes1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.longTime.testAmperes1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.longTime.toleranceMin1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMin1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.longTime.toleranceMax1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMax1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.longTime.pole1.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.pole1.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.longTime.pole2.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.pole2.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.longTime.pole3.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.pole3.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={tableStyles.cell}>LTPU</td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.longTime.toleranceMin || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.longTime.toleranceMin', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.longTime.toleranceMax || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.longTime.toleranceMax', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.longTime.testAmperes2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.longTime.testAmperes2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.longTime.toleranceMin2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMin2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.longTime.toleranceMax2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.longTime.toleranceMax2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.longTime.pole1.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.pole1.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.longTime.pole2.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.pole2.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.longTime.pole3.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.longTime.pole3.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                </tr>

                {/* Short Time */}
                <tr>
                  <td className={`${tableStyles.cell} py-0 text-xs`} rowSpan={2}>Short Time</td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.shortTime.ratedAmperes1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.shortTime.ratedAmperes1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.shortTime.multiplier || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.shortTime.multiplier', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.shortTime.testAmperes1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.shortTime.testAmperes1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMin1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMin1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMax1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMax1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.shortTime.pole1.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.pole1.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.shortTime.pole2.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.pole2.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.shortTime.pole3.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.pole3.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={tableStyles.cell}>STPU</td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.shortTime.toleranceMin || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.shortTime.toleranceMin', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.shortTime.toleranceMax || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.shortTime.toleranceMax', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.shortTime.testAmperes2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.shortTime.testAmperes2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMin2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMin2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.shortTime.toleranceMax2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.shortTime.toleranceMax2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.shortTime.pole1.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.pole1.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.shortTime.pole2.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.pole2.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.shortTime.pole3.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.shortTime.pole3.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                </tr>

                {/* Instantaneous */}
                <tr>
                  <td className={`${tableStyles.cell} py-0 text-xs`} rowSpan={2}>Instantaneous</td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.instantaneous.ratedAmperes1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.instantaneous.ratedAmperes1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.instantaneous.multiplier || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.instantaneous.multiplier', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}></td>
                  <td className={tableStyles.cell}></td>
                  <td className={tableStyles.cell}></td>
                  <td className={`${tableStyles.cell} text-center`}></td>
                  <td className={`${tableStyles.cell} text-center`}></td>
                  <td className={`${tableStyles.cell} text-center`}></td>
                </tr>
                <tr>
                  <td className={tableStyles.cell}>IPU</td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.instantaneous.toleranceMin || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.instantaneous.toleranceMin', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.instantaneous.toleranceMax || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.instantaneous.toleranceMax', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.instantaneous.testAmperes2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.instantaneous.testAmperes2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.instantaneous.toleranceMin2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.instantaneous.toleranceMin2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.instantaneous.toleranceMax2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.instantaneous.toleranceMax2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.instantaneous.pole1.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole1.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.instantaneous.pole2.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole2.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.instantaneous.pole3.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.instantaneous.pole3.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                </tr>

                {/* Ground Fault */}
                <tr>
                  <td className={`${tableStyles.cell} py-0 text-xs`} rowSpan={2}>Ground Fault</td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.groundFault.ratedAmperes1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.groundFault.ratedAmperes1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`} colSpan={2}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.groundFault.multiplier || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.groundFault.multiplier', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.groundFault.testAmperes1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.groundFault.testAmperes1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMin1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMin1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMax1 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMax1', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.groundFault.pole1.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.pole1.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.groundFault.pole2.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.pole2.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.groundFault.pole3.sec || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.pole3.sec', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">sec.</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={tableStyles.cell}>GFPU</td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.groundFault.toleranceMin || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.groundFault.toleranceMin', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input
                      type="text"
                      value={(formData.primaryInjection.results.groundFault.toleranceMax || '').replace(/%/g, '')}
                      onChange={(e) => {
                        const v = `${e.target.value}`.replace(/[^0-9.-]/g, '');
                        handleChange('primaryInjection.results.groundFault.toleranceMax', v ? `${v}%` : '');
                      }}
                      readOnly={!isEditing}
                      className={`${tableStyles.input} text-center`}
                    />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.groundFault.testAmperes2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.groundFault.testAmperes2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMin2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMin2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={tableStyles.cell}>
                    <input type="text" value={formData.primaryInjection.results.groundFault.toleranceMax2 || ''} 
                    onChange={(e) => handleChange('primaryInjection.results.groundFault.toleranceMax2', e.target.value)} 
                    readOnly={!isEditing} className={`${tableStyles.input} text-center`} />
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.groundFault.pole1.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.pole1.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.groundFault.pole2.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.pole2.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                  <td className={`${tableStyles.cell} text-center`}>
                    <div className="flex items-center justify-center">
                      <input type="text" value={formData.primaryInjection.results.groundFault.pole3.a || ''} 
                      onChange={(e) => handleChange('primaryInjection.results.groundFault.pole3.a', e.target.value)} 
                      readOnly={!isEditing} className={`${tableStyles.input} text-center w-20`} />
                      <span className="ml-1">A</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="hidden print:block primary-injection-pdf-layout">
            <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black primary-injection-main-pdf-table">
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Function</th>
                  <th>Test</th>
                  <th>Rated Amps.</th>
                  <th>Multiplier %</th>
                  <th>Test Amps.</th>
                  <th>Min</th>
                  <th>Max</th>
                </tr>
              </thead>
              <tbody>
                {primaryInjectionPrintSections.map(({ key, label, pickupLabel }) => {
                  const result = formData.primaryInjection.results[key];
                  return (
                    <React.Fragment key={key}>
                      <tr>
                        <td rowSpan={2}>{label}</td>
                        <td>Timing</td>
                        <td>{result.ratedAmperes1 || ''}</td>
                        <td>{(result.multiplier || '').replace(/%/g, '')}</td>
                        <td>{result.testAmperes1 || ''}</td>
                        <td>{result.toleranceMin1 || ''}</td>
                        <td>{result.toleranceMax1 || ''}</td>
                      </tr>
                      <tr>
                        <td>{pickupLabel}</td>
                        <td>{result.ratedAmperes2 || ''}</td>
                        <td>{`${(result.toleranceMin || '').replace(/%/g, '')} / ${(result.toleranceMax || '').replace(/%/g, '')}`}</td>
                        <td>{result.testAmperes2 || ''}</td>
                        <td>{result.toleranceMin2 || ''}</td>
                        <td>{result.toleranceMax2 || ''}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black primary-injection-poles-pdf-table">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Function</th>
                  <th>Reading</th>
                  <th>Pole 1</th>
                  <th>Pole 2</th>
                  <th>Pole 3</th>
                </tr>
              </thead>
              <tbody>
                {primaryInjectionPrintSections.map(({ key, label, pickupLabel }) => {
                  const result = formData.primaryInjection.results[key];
                  return (
                    <React.Fragment key={`${key}-poles`}>
                      <tr>
                        <td rowSpan={2}>{label}</td>
                        <td>Timing</td>
                        <td>{formatPoleValue(result.pole1.sec, 'sec.')}</td>
                        <td>{formatPoleValue(result.pole2.sec, 'sec.')}</td>
                        <td>{formatPoleValue(result.pole3.sec, 'sec.')}</td>
                      </tr>
                      <tr>
                        <td>{pickupLabel}</td>
                        <td>{formatPoleValue(result.pole1.a, 'A')}</td>
                        <td>{formatPoleValue(result.pole2.a, 'A')}</td>
                        <td>{formatPoleValue(result.pole3.a, 'A')}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* --- Test Equipment Used Section --- */}
          <div className="mb-6 print:hidden">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
          <div className="grid grid-cols-1 gap-y-4">
            {/* Megohmmeter */}
            <div className="flex items-center">
              <label className="form-label inline-block w-32">Megohmmeter:</label>
              <EquipmentAutocomplete
                value={formData.testEquipment.megohmmeter.name}
                onChange={(value) => handleChange('testEquipment.megohmmeter.name', value)}
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
                  setFormData(p => ({
                    ...p,
                    testEquipment: {
                      ...p.testEquipment,
                      megohmmeter: {
                        name: equipment.equipment_name,
                        serialNumber: equipment.serial_number || '',
                        ampId: equipment.amp_id || '',
                        calDate: formatLocalDateShort(equipment.calibration_date),
                      }
                    }
                  }));
                }}
                readOnly={!isEditing}
                className="flex-1"
              />
              <label className="form-label inline-block w-32 ml-4">Serial Number:</label>
              <input type="text" value={formData.testEquipment.megohmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.megohmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
              <label className="form-label inline-block w-24 ml-4">AMP ID:</label>
              <input type="text" value={formData.testEquipment.megohmmeter.ampId} onChange={(e) => handleChange('testEquipment.megohmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
              <label className="form-label inline-block w-24 ml-4">Cal Date:</label>
              <input type="text" value={formData.testEquipment.megohmmeter.calDate} onChange={(e) => handleChange('testEquipment.megohmmeter.calDate', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
            </div>
            {/* Low Resistance Ohmmeter */}
            <div className="flex items-center">
              <label className="form-label inline-block w-32">Low-Resistance Ohmmeter:</label>
              <EquipmentAutocomplete
                value={formData.testEquipment.lowResistanceOhmmeter.name}
                onChange={(value) => handleChange('testEquipment.lowResistanceOhmmeter.name', value)}
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
                  setFormData(p => ({
                    ...p,
                    testEquipment: {
                      ...p.testEquipment,
                      lowResistanceOhmmeter: {
                        name: equipment.equipment_name,
                        serialNumber: equipment.serial_number || '',
                        ampId: equipment.amp_id || '',
                        calDate: formatLocalDateShort(equipment.calibration_date),
                      }
                    }
                  }));
                }}
                readOnly={!isEditing}
                className="flex-1"
              />
              <label className="form-label inline-block w-32 ml-4">Serial Number:</label>
              <input type="text" value={formData.testEquipment.lowResistanceOhmmeter.serialNumber} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
              <label className="form-label inline-block w-24 ml-4">AMP ID:</label>
              <input type="text" value={formData.testEquipment.lowResistanceOhmmeter.ampId} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.ampId', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
              <label className="form-label inline-block w-24 ml-4">Cal Date:</label>
              <input type="text" value={formData.testEquipment.lowResistanceOhmmeter.calDate} onChange={(e) => handleChange('testEquipment.lowResistanceOhmmeter.calDate', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
            </div>
            {/* Primary Injection Test Set */}
            <div className="flex items-center">
              <label className="form-label inline-block w-32">Primary Injection Test Set:</label>
              <EquipmentAutocomplete
                value={formData.testEquipment.primaryInjectionTestSet.name}
                onChange={(value) => handleChange('testEquipment.primaryInjectionTestSet.name', value)}
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
                  setFormData(p => ({
                    ...p,
                    testEquipment: {
                      ...p.testEquipment,
                      primaryInjectionTestSet: {
                        name: equipment.equipment_name,
                        serialNumber: equipment.serial_number || '',
                        ampId: equipment.amp_id || '',
                        calDate: formatLocalDateShort(equipment.calibration_date),
                      }
                    }
                  }));
                }}
                readOnly={!isEditing}
                className="flex-1"
              />
              <label className="form-label inline-block w-32 ml-4">Serial Number:</label>
              <input type="text" value={formData.testEquipment.primaryInjectionTestSet.serialNumber} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
              <label className="form-label inline-block w-24 ml-4">AMP ID:</label>
              <input type="text" value={formData.testEquipment.primaryInjectionTestSet.ampId} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.ampId', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
              <label className="form-label inline-block w-24 ml-4">Cal Date:</label>
              <input type="text" value={formData.testEquipment.primaryInjectionTestSet.calDate} onChange={(e) => handleChange('testEquipment.primaryInjectionTestSet.calDate', e.target.value)} readOnly={!isEditing} className={`form-input flex-1 ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`} />
            </div>
          </div>
          </div>

        {/* Print-Only Test Equipment Used Table */}
          <div className="hidden print:block">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-black border-b border-black pb-2 font-bold">Test Equipment Used</h2>
            <table className="w-full border-collapse border border-black mb-6">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Equipment</th>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Serial Number</th>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">AMP ID</th>
                  <th className="border border-black px-2 py-1 text-left text-sm font-bold bg-gray-100">Cal Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.name || 'Megohmmeter'}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.serialNumber}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.ampId}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.megohmmeter.calDate}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.name || 'Low-Res Ohmmeter'}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.serialNumber}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.ampId}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.lowResistanceOhmmeter.calDate}</td>
                </tr>
                <tr>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.name || 'Primary Inj Test Set'}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.serialNumber}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.ampId}</td>
                  <td className="border border-black px-2 py-1 text-sm">{formData.testEquipment.primaryInjectionTestSet.calDate}</td>
                </tr>
              </tbody>
            </table>
          </div>

        {/* --- Comments Section --- */}
          <div className="mb-6 print:hidden">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
          <div className="mb-4">
            <textarea 
              value={formData.comments} 
              onChange={(e) => handleChange('comments', e.target.value)}
              readOnly={!isEditing}
              className={`w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-150' : ''}`}
              rows={4}
            />
          </div>
          </div>

          {/* Print-Only Comments Table */}
          <div className="hidden print:block mb-6 comments-print-section">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-black border-b border-black pb-2 font-bold">Comments</h2>
            <div className="comments-cell border-2 border-black px-4 py-4 text-sm" style={{minHeight: '120px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5'}}>
              {formData.comments || '\u00A0'}
            </div>
          </div>
         </div>
       </div>      {/* Mark Ready to Review Button */}
      {!isPrintMode && isEditing && (
        <div className="mb-6 print:hidden flex justify-center">
          <button
            onClick={async () => {
              if (!jobId || !user?.id) return;
              
              try {
                // Save the report first
                await handleSave();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Get the report ID (may have been created by save)
                const savedReportId = currentReportId || window.location.pathname.split('/').pop();
                if (!savedReportId) throw new Error('Failed to save report');
                
                // Update asset status to ready_for_review
                const fileUrl = `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`;
                const { error } = await supabase
                  .schema('neta_ops')
                  .from('assets')
                  .update({ 
                    status: 'ready_for_review',
                    submitted_at: new Date().toISOString()
                  })
                  .eq('file_url', fileUrl);
                
                if (error) throw error;
                
                alert('Report marked as ready for review!');
              } catch (error: any) {
                console.error('Error marking report as ready:', error);
                alert(`Failed to mark as ready: ${error?.message || 'Unknown error'}`);
              }
            }}
            className="px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Mark Ready to Review
          </button>
        </div>
      )}

     </ReportWrapper>
      );
 };

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* Screen styles for primary injection table */
    .primary-injection-table { 
      table-layout: fixed !important; 
      width: 100% !important; 
    }
    .primary-injection-table col:nth-child(1) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }
    .primary-injection-table col:nth-child(2) { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }
    .primary-injection-table col:nth-child(3) { width: 5% !important; min-width: 5% !important; max-width: 5% !important; }
    .primary-injection-table col:nth-child(4) { width: 5% !important; min-width: 5% !important; max-width: 5% !important; }
    .primary-injection-table col:nth-child(5) { width: 11% !important; min-width: 11% !important; max-width: 11% !important; }
    .primary-injection-table col:nth-child(6) { width: 7% !important; min-width: 7% !important; max-width: 7% !important; }
    .primary-injection-table col:nth-child(7) { width: 7% !important; min-width: 7% !important; max-width: 7% !important; }
    .primary-injection-table col:nth-child(8) { width: 15.33% !important; min-width: 15.33% !important; max-width: 15.33% !important; }
    .primary-injection-table col:nth-child(9) { width: 15.33% !important; min-width: 15.33% !important; max-width: 15.33% !important; }
    .primary-injection-table col:nth-child(10) { width: 15.34% !important; min-width: 15.34% !important; max-width: 15.34% !important; }
    .primary-injection-table td:nth-child(n+7) > div,
    .primary-injection-table td:nth-child(n+7) .flex {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-wrap: nowrap !important;
      gap: 2px !important;
      width: 100% !important;
      white-space: nowrap !important;
    }
    .primary-injection-table td:nth-child(n+7) input {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      width: auto !important;
    }
    .primary-injection-table td:nth-child(n+7) span {
      flex: 0 0 auto !important;
      margin-left: 1px !important;
      white-space: nowrap !important;
    }
    
    /* Hide tolerance input section in print */
    .no-print-tolerance-section {
      display: block !important;
    }
    
    /* Ensure tolerance inputs display full numbers without truncation */
    .no-print-tolerance-section input[type="text"] {
      min-width: 100px !important;
      width: 100% !important;
      text-align: left !important;
      padding-left: 12px !important;
      padding-right: 12px !important;
      overflow: visible !important;
      white-space: nowrap !important;
    }
    
    .primary-injection-table th {
      font-size: 10px !important;
      padding: 2px !important;
      white-space: normal !important;
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      line-height: 1.2 !important;
      vertical-align: middle !important;
    }
    
    .primary-injection-table td {
      overflow: hidden !important; /* keep content within the box */
      white-space: nowrap !important; /* prevent wrapping that can shift layout */
      vertical-align: middle !important;
      text-align: center !important; /* center readings horizontally */
      padding: 2px !important;
    }

    /* Center inputs and ensure they fit inside cells */
    .primary-injection-table td input[type="text"] {
      text-align: center !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      padding: 0 2px !important;
      margin: 0 auto !important;
      display: block !important;
    }

    /* Explicitly center left Tol.% (col 3) */
    .primary-injection-table tbody td:nth-child(3) input {
      text-align: center !important;
      width: 90% !important;
      max-width: 90% !important;
      margin: 0 auto !important;
    }
    /* Min column (nth-child 6) - tolerance min */
    .primary-injection-table tbody td:nth-child(6) input {
      text-align: center !important;
      width: 90% !important;
      max-width: 90% !important;
      margin: 0 auto !important;
      font-size: 12px !important;
      padding: 2px 4px !important;
    }

    /* Max column (nth-child 7) - tolerance max */
    .primary-injection-table tbody td:nth-child(7) input {
      text-align: center !important;
      width: 90% !important;
      max-width: 90% !important;
      margin: 0 auto !important;
      font-size: 12px !important;
      padding: 2px 4px !important;
    }
    
    /* Screen-only: Make tolerance inputs larger and more visible */
    @media screen {
      .primary-injection-table tbody td:nth-child(6) input,
      .primary-injection-table tbody td:nth-child(7) input {
        font-size: 13px !important;
        padding: 4px 6px !important;
        min-height: 28px !important;
      }
      
      /* Make all table inputs more readable on screen */
      .primary-injection-table tbody td input[type="text"] {
        font-size: 13px !important;
        padding: 4px 6px !important;
        min-height: 28px !important;
      }
      
      /* Expand table container on screen for better visibility */
      .primary-injection-container {
        overflow-x: visible !important;
      }
    }

    /* Ensure Test Amps (nth-child 5) stays centered */
    .primary-injection-table tbody td:nth-child(5) input {
      text-align: center !important;
      width: 90% !important;
      max-width: 90% !important;
      margin: 0 auto !important;
    }

    /* Undo centering side-effects on Pole columns (8-10):
       rely on their internal flex wrappers for layout */
    .primary-injection-table tbody td:nth-child(8),
    .primary-injection-table tbody td:nth-child(9),
    .primary-injection-table tbody td:nth-child(10) {
      text-align: left !important;
    }
    
    /* Center the multiplier and tolerance column headers */
    .primary-injection-table thead tr:nth-child(2) th:nth-child(2),
    .primary-injection-table thead tr:nth-child(2) th:nth-child(3),
    .primary-injection-table thead tr:nth-child(2) th:nth-child(6),
    .primary-injection-table thead tr:nth-child(2) th:nth-child(7) {
      text-align: center !important;
      vertical-align: middle !important;
    }
    
    @media print {
      body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
      * { color: black !important; }
      
      /* Hide tolerance input section in print */
      .no-print-tolerance-section {
        display: none !important;
      }
      
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
      
      /* Print utility classes */
      .print\\:break-before-page { page-break-before: always; }
      .print\\:break-after-page { page-break-after: always; }
      .print\\:break-inside-avoid { page-break-inside: avoid; }
      .print\\:text-black { color: black !important; }
      .print\\:bg-white { background-color: white !important; }
      .print\\:border-black { border-color: black !important; }
      .print\\:font-bold { font-weight: bold !important; }
      .print\\:text-center { text-align: center !important; }
      
      /* Table styling */
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid black !important; padding: 4px !important; }
      th { background-color: #f0f0f0 !important; font-weight: bold !important; }
      
      /* Form elements - hide interactive indicators */
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
      
      /* Section styling - allow sections to break if needed */
      section { margin-bottom: 20px !important; }
      
      /* Force input boxes to stay within their cells */
      .max-w-7xl table input {
        max-width: calc(100% - 2px) !important;
        box-sizing: border-box !important;
      }
      
      /* Visual & Mechanical table widths (5/80/15): NETA Section 5%, Description 80%, Results 15% */
      .visual-mechanical-table { table-layout: fixed !important; width: 100% !important; }
      .visual-mechanical-table col:nth-child(1) { width: 5% !important; }
      .visual-mechanical-table col:nth-child(2) { width: 80% !important; }
      .visual-mechanical-table col:nth-child(3) { width: 15% !important; }
      
      /* Ensure full width and proper scaling for PDF */
      .max-w-7xl { max-width: none !important; width: 100% !important; }
      @page { size: A4; margin: 0.5in; }
      
      /* Insulation Resistance table explicit widths for PDF */
      .ins-res-table { table-layout: fixed !important; width: 100% !important; }
      .ins-res-table col:nth-child(1) { width: 16% !important; }
      .ins-res-table col:nth-child(2),
      .ins-res-table col:nth-child(3),
      .ins-res-table col:nth-child(4),
      .ins-res-table col:nth-child(5),
      .ins-res-table col:nth-child(6),
      .ins-res-table col:nth-child(7) { width: 12.5% !important; }
      .ins-res-table col:nth-child(8) { width: 9% !important; }

      /* Nameplate print table: keep long values inside their cells */
      .nameplate-print-table {
        table-layout: fixed !important;
        width: 100% !important;
      }
      .nameplate-print-table td,
      .nameplate-print-table td div {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        max-width: 100% !important;
        overflow: hidden !important;
        line-height: 1.15 !important;
      }
      .nameplate-print-table td {
        padding: 2px 3px !important;
        vertical-align: top !important;
      }
      
      /* Primary Injection table explicit widths for PDF */
      .primary-injection-table { table-layout: fixed !important; width: 100% !important; }
      .primary-injection-table col:nth-child(1) { width: 9% !important; min-width: 9% !important; max-width: 9% !important; }
      .primary-injection-table col:nth-child(2) { width: 10% !important; min-width: 10% !important; max-width: 10% !important; }
      .primary-injection-table col:nth-child(3) { width: 5% !important; min-width: 5% !important; max-width: 5% !important; }
      .primary-injection-table col:nth-child(4) { width: 5% !important; min-width: 5% !important; max-width: 5% !important; }
      .primary-injection-table col:nth-child(5) { width: 11% !important; min-width: 11% !important; max-width: 11% !important; }
      .primary-injection-table col:nth-child(6) { width: 7% !important; min-width: 7% !important; max-width: 7% !important; }
      .primary-injection-table col:nth-child(7) { width: 7% !important; min-width: 7% !important; max-width: 7% !important; }
      .primary-injection-table col:nth-child(8) { width: 15.33% !important; min-width: 15.33% !important; max-width: 15.33% !important; }
      .primary-injection-table col:nth-child(9) { width: 15.33% !important; min-width: 15.33% !important; max-width: 15.33% !important; }
      .primary-injection-table col:nth-child(10) { width: 15.34% !important; min-width: 15.34% !important; max-width: 15.34% !important; }

      /* Reduce row height for primary injection table in print */
      .primary-injection-table th,
      .primary-injection-table td { padding-top: 1px !important; padding-bottom: 1px !important; line-height: 1 !important; }
      .primary-injection-table thead th { font-size: 9px !important; }
      .primary-injection-table tbody td { font-size: 9px !important; }
      .primary-injection-table th[rowspan],
      .primary-injection-table td[rowspan] { padding-top: 1px !important; padding-bottom: 1px !important; }
      .primary-injection-table input,
      .primary-injection-table select { padding: 0 2px !important; height: 14px !important; font-size: 9px !important; line-height: 1 !important; }
      .primary-injection-table td:nth-child(n+7) > div,
      .primary-injection-table td:nth-child(n+7) .flex {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex-wrap: nowrap !important;
        gap: 2px !important;
        width: 100% !important;
        white-space: nowrap !important;
      }
      .primary-injection-table td:nth-child(n+7) input {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        width: auto !important;
      }
      .primary-injection-table td:nth-child(n+7) span {
        flex: 0 0 auto !important;
        margin-left: 1px !important;
        white-space: nowrap !important;
      }
      
      /* Allow page breaks in sections for long content */
      .mb-6 {
        margin-bottom: 15px !important;
      }
      
      /* Ensure proper spacing for print */
      .space-y-6 > * + * {
        margin-top: 15px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// Append ATS-matching print overrides to ensure MTS matches ATS print layout
if (typeof document !== 'undefined') {
  const style2 = document.createElement('style');
  style2.textContent = `
    /* Hide navigation bar and scrollbar */
    nav, header, .navigation, [class*="nav"], [class*="header"] {
      display: none !important;
    }
    ::-webkit-scrollbar { display: none; }
    html { -ms-overflow-style: none; scrollbar-width: none; height: 100%; }
    body { overflow-x: hidden; min-height: 100vh; padding-bottom: 100px; }
    textarea { min-height: 200px !important; }

    @media print {
      /* Force status badge colors to print correctly */
      .pass-fail-status-box.status-fail {
        background-color: #ef4444 !important;
        border-color: #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.status-pass {
        background-color: #22c55e !important;
        border-color: #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.status-limited {
        background-color: #eab308 !important;
        border-color: #ca8a04 !important;
        color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      /* Allow comments section to expand fully and break across pages if needed */
      .comments-print-section {
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .comments-cell {
        display: block !important;
        width: 100% !important;
        height: auto !important;
        min-height: 150px !important;
        max-height: none !important;
        overflow: visible !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-word !important;
        line-height: 1.6 !important;
        font-size: 10px !important;
        padding: 12px !important;
        box-sizing: border-box !important;
      }
      html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif !important;
        font-size: 9px !important;
        background: white !important;
        line-height: 1 !important;
        height: auto !important;
        min-height: auto !important;
        max-height: none !important;
      }
      /* Standard portrait page size with minimal margins */
      @page { 
        size: 8.5in 11in; 
        margin: 0.1in;
        orphans: 2;
        widows: 2;
      }
      /* Allow content to flow across multiple pages */
      body, #root, .max-w-7xl {
        height: auto !important;
        min-height: auto !important;
        max-height: none !important;
      }
      /* Hide all non-print elements */
      .print\\:hidden { display: none !important; }
      /* Hide original on-screen job info grid in print */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      /* Hide second title and back button in print only */
      .flex.justify-between.items-center.mb-6 { display: none !important; }
      .flex.items-center.gap-4 { display: none !important; }
      button { display: none !important; }
      /* Print header styling */
      .print\\:flex {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        border-bottom: 2px solid black !important;
        padding-bottom: 8px !important;
        margin-bottom: 12px !important;
        page-break-after: avoid !important;
      }
      /* Print header logo */
      .print\\:flex img {
        height: 40px !important;
        width: auto !important;
        max-height: 40px !important;
      }
      /* Print header title */
      .print\\:flex h1 {
        font-size: 18px !important;
        font-weight: bold !important;
        color: black !important;
        margin: 0 !important;
        text-align: center !important;
      }
      /* Print header NETA text */
      .print\\:flex div[style*="color: #1a4e7c"] {
        color: #1a4e7c !important;
        font-size: 16px !important;
        font-weight: bold !important;
        text-align: right !important;
      }
      /* Print header status box — scope green to PASS only so LIMITED SERVICE stays yellow */
      .pass-fail-status-box.status-pass {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box {
        display: inline-block !important;
        padding: 4px 10px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        text-align: center !important;
        width: fit-content !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
        min-width: 50px !important;
        margin-top: 4px !important;
      }
      /* Nameplate print table: wrap long values instead of stretching columns */
      .nameplate-print-table {
        table-layout: fixed !important;
        width: 100% !important;
      }
      .nameplate-print-table td,
      .nameplate-print-table td div {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        max-width: 100% !important;
        overflow: hidden !important;
        line-height: 1.15 !important;
      }
      .nameplate-print-table td {
        padding: 2px 3px !important;
        vertical-align: top !important;
      }
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
      /* Orange divider lines */
      .w-full.h-1.bg-\\[\\#f26722\\] {
        background-color: #f26722 !important;
        height: 4px !important;
        margin-bottom: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        border: none !important;
        border-radius: 0 !important;
      }
      /* Remove pseudo-element - not working properly */
      h2::before { display: none !important; }
      /* Add extra spacing after tables to prevent overlap */
      table { 
        margin-bottom: 8px !important;
      }
      /* Ensure long tables can split across pages safely and keep headers */
      thead { display: table-header-group !important; }
      tbody { page-break-inside: auto !important; break-inside: auto !important; }
      tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      /* Avoid clipping within scroll containers */
      .relative.overflow-x-auto, .overflow-x-auto { overflow: visible !important; }
      /* Primary Injection: start on a fresh page so the section heading,
         tested settings, and main table header don't get orphaned. */
      .primary-injection-section { 
        page-break-before: always !important;
        break-before: page !important;
        page-break-inside: auto !important; 
        break-inside: auto !important;
      }
      .primary-injection-container { overflow: visible !important; }
      .primary-injection-table { 
        table-layout: fixed !important; 
        width: 100% !important;
        page-break-before: auto !important;
        page-break-after: auto !important;
        page-break-inside: auto !important;
      }
      .primary-injection-table tbody {
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .primary-injection-table thead {
        display: table-header-group !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid-page !important;
      }
      .primary-injection-table tbody tr:first-child {
        page-break-before: avoid !important;
        break-before: avoid-page !important;
      }
      .primary-injection-pdf-layout {
        display: block !important;
        margin-top: 4px !important;
      }
      .primary-injection-main-pdf-table,
      .primary-injection-poles-pdf-table {
        display: table !important;
        table-layout: fixed !important;
        width: 100% !important;
        min-width: 100% !important;
        max-width: 100% !important;
        border-collapse: collapse !important;
        margin-bottom: 8px !important;
      }
      .primary-injection-main-pdf-table thead,
      .primary-injection-poles-pdf-table thead {
        display: table-header-group !important;
      }
      .primary-injection-main-pdf-table tbody,
      .primary-injection-poles-pdf-table tbody {
        display: table-row-group !important;
      }
      .primary-injection-main-pdf-table tr,
      .primary-injection-poles-pdf-table tr {
        display: table-row !important;
      }
      .primary-injection-main-pdf-table th,
      .primary-injection-main-pdf-table td,
      .primary-injection-poles-pdf-table th,
      .primary-injection-poles-pdf-table td {
        display: table-cell !important;
        border: 1px solid black !important;
        padding: 2px 4px !important;
        font-size: 9px !important;
        line-height: 1.15 !important;
        text-align: center !important;
        vertical-align: middle !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }
      .primary-injection-main-pdf-table th,
      .primary-injection-poles-pdf-table th {
        background-color: #f0f0f0 !important;
        font-weight: bold !important;
      }
      .primary-injection-poles-pdf-table td:nth-child(n+3) {
        white-space: nowrap !important;
        font-size: 10px !important;
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
      /* Remove ALL section styling - no boxes, allow page breaks */
      section {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        margin-bottom: 2px !important;
      }
      /* Remove any div that might create boxes */
      div[class*="border"], div[class*="shadow"], div[class*="rounded"] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      /* Ensure no padding on any containers */
      div[class*="p-"], div[class*="px-"], div[class*="py-"], div[class*="pt-"], div[class*="pb-"], div[class*="pl-"], div[class*="pr-"] {
        padding: 0 !important;
      }
      /* FORCE remove all borders and boxes from everything except tables */
      * { border: none !important; box-shadow: none !important; outline: none !important; }
      /* Specifically target and remove print borders */
      .print\\:border { border: none !important; }
      .print\\:border-black { border: none !important; }
      /* Remove borders from divs with these specific classes */
      div.bg-white, div.dark\\:bg-dark-150, div.print\\:border, div.print\\:border-black {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      /* Only allow borders on table elements */
      table, th, td, thead, tbody, tr { border: 1px solid black !important; }
      /* Ensure table has outer border */
      table { border: 1.5px solid black !important; }
      /* Allow borders on inputs */
      input, select, textarea { border-bottom: 1px solid black !important; }
      textarea { border: 1px solid black !important; }
      /* Respect print:hidden; do not force grids visible */
      #report-container .print\\:hidden { display: none !important; }
      /* Optional spacing for grids that are visible */
      #report-container .grid { gap: 1px !important; margin-bottom: 2px !important; }
      /* Job info section - ultra compact horizontal layout */
      .grid-cols-1.md\\:grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; gap: 4px !important; }
      /* Large screen job info - 6 columns */
      .grid-cols-1.md\\:grid-cols-4.lg\\:grid-cols-6 { grid-template-columns: repeat(6, 1fr) !important; gap: 4px !important; }
    }
  `;
  document.head.appendChild(style2);
}

 export default LowVoltageCircuitBreakerElectronicTripMTSReport; 
