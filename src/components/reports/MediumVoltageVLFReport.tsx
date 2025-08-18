import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useUser } from '@supabase/auth-helpers-react';  // Keep this for now as we need the useUser hook
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { FileText, Save, ChevronLeft, UploadIcon, Pencil as PencilIcon } from 'lucide-react';
import { navigateAfterSave } from '../reports/ReportUtils';
import { ReportWrapper } from './ReportWrapper';

// UI Components
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/Select';
import Card, { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/Card';
import { getReportName, getAssetName } from './reportMappings';

// Types
enum TestStatus {
  PASS = 'PASS',
  FAIL = 'FAIL'
}

enum CablePhase {
  A = "A",
  B = "B",
  C = "C",
  N = "N"
}

enum InspectionResult {
  SELECT = 'select one',
  SATISFACTORY = 'satisfactory',
  UNSATISFACTORY = 'unsatisfactory',
  CLEANED = 'cleaned',
  SEE_COMMENTS = 'see comments',
  NONE = 'none of the above'
}

// Unit Options
const continuityUnits = [
  { label: 'Ohms', symbol: 'Ω' },
  { label: 'Milliohms', symbol: 'mΩ' },
  { label: 'Microohms', symbol: 'μΩ' }
];

const insulationTestVoltages = [
  { label: '500 V', value: '500' },
  { label: '1000 V', value: '1000' },
  { label: '2500 V', value: '2500' },
  { label: '5000 V', value: '5000' },
  { label: '10000 V', value: '10000' }
];

const insulationUnits = [
  { label: 'Gigaohms', symbol: 'GΩ' },
  { label: 'Megaohms', symbol: 'MΩ' },
  { label: 'kilaohms', symbol: 'kΩ' }
];

// Current units for withstand test
const currentUnits = [
  { label: 'Milliamps', symbol: 'mA' },
  { label: 'Microamps', symbol: 'µA' }
];

interface MediumVoltageVLFReportForm {
  reportInfo: {
    title?: string;
    date?: string;
    location?: string;
    technicians?: string[];
    reportNumber?: string;
    customerName?: string;
    customerContactName?: string;
    customerContactEmail?: string;
    customerContactPhone?: string;
  };
  status?: TestStatus;
  customerName: string;
  siteAddress: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  jobNumber?: string;
  identifier?: string;
  testedBy: string;
  testDate: string;
  location?: string; // Added for substation
  equipmentLocation?: string; // Added for equipment location
  
  // Cable information
  cableInfo: {
    description: string;
    size: string;
    length: string;
    voltageRating: string;
    insulation: string;
    yearInstalled: string;
    testedFrom?: string;  // Keep testedFrom
    testedTo?: string;    // Keep testedTo
    from?: string;        // Separate from field
    to?: string;          // Separate to field
    manufacturer?: string;
    insulationThickness?: string;
    conductorMaterial?: string;
  };
  cableType: string;
  operatingVoltage: string;
  cableLength: string;
  
  // Termination data
  terminationData: {
    terminationData: string;
    ratedVoltage: string;
    terminationData2: string;
    ratedVoltage2: string;
    from?: string;
    to?: string;
  };
  
  // Visual and Mechanical Inspection
  visualInspection: {
    compareData: InspectionResult;           // 7.3.3.A.1
    inspectDamage: InspectionResult;         // 7.3.3.A.2
    useOhmmeter: InspectionResult;           // 7.3.3.A.3.1
    inspectConnectors: InspectionResult;     // 7.3.3.A.4
    inspectGrounding: InspectionResult;      // 7.3.3.A.5
    verifyBends: InspectionResult;           // 7.3.3.A.6
    inspectCurrentTransformers: InspectionResult; // 7.3.3.A.8
    inspectIdentification: InspectionResult; // 7.3.3.A.9
    inspectJacket: InspectionResult;         // 7.3.3.A.10
  };
  
  // Electrical Tests - Shield Continuity
  shieldContinuity: {
    phaseA: string;
    phaseB: string;
    phaseC: string;
    unit: string; // Added unit property
  };
  
  // Electrical Tests - Insulation Resistance Values
  insulationTest: {
    testVoltage: string;
    unit: string; // Added unit property
    preTest: {
      ag: string;
      bg: string;
      cg: string;
    };
    postTest: {
      ag: string;
      bg: string;
      cg: string;
    };
    preTestCorrected: {
      ag: string;
      bg: string;
      cg: string;
    };
    postTestCorrected: {
      ag: string;
      bg: string;
      cg: string;
    };
  };
  
  // Test Equipment
  equipment: {
    ohmmeter: string;
    ohmSerialNumber: string;
    megohmmeter: string;
    megohmSerialNumber: string;
    vlfHipot: string;
    vlfSerialNumber: string;
    ampId: string;
    vlfTestSet?: string; // Keep for backward compatibility
  };
  
  // Temperature correction data
  temperature: {
    fahrenheit: number;
    celsius: number;
    humidity: number;
    tcf: number;
  };
  
  // Comments
  comments: string;
  
  // For backward compatibility
  testEquipment: {
    vlf: string;
    vlfCalibrationDate: string;
    insulationTester: string;
    insulationTesterCalibrationDate: string;
  };
  vlfTests?: Array<{
    testVoltage: string;
    duration: string;
    phase: CablePhase;
    result: string;
    notes: string;
  }>;
  insulationResistanceTests?: Array<{
    phase: CablePhase;
    testVoltage: string;
    oneMinuteReading: string;
    tenMinuteReading: string;
    piRatio: string;
  }>;
  voltageBreakdownChart?: any;
  voltageBreakdownPreview?: string;
  testConditions?: {
    weatherConditions: string;
    temperature: string;
    humidity: string;
    cableCondition: string;
  };
  conclusion?: string;
  recommendations?: string;
  testEngineer?: string;
  clientRepresentative?: string;
  reportDate?: string;
  equipmentType?: string;
  equipmentInfo?: {
    type?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    ratingKV?: string;
    ratingKVA?: string;
    installationDate?: string;
    lastMaintenanceDate?: string;
  };
  testData?: {
    testVoltage?: string;
    testDuration?: string;
    frequency?: string;
    leakageCurrentPhaseA?: string;
    leakageCurrentPhaseB?: string;
    leakageCurrentPhaseC?: string;
  };
  testResults?: {
    summary?: string;
    phaseAStatus?: string;
    phaseBStatus?: string;
    phaseCStatus?: string;
    overallResult?: string;
    recommendedActions?: string;
  };
  notes?: string;
  signatures?: {
    technicianSignature?: string;
    customerSignature?: string;
  };
  
  // Electrical Tests Withstand Test
  withstandTest: {
    readings: Array<{
      timeMinutes: string;
      kVAC: string;
      phaseA: {
        mA: string;
        nF: string;
        currentUnit?: string; // Add currentUnit property
      };
      phaseB: {
        mA: string;
        nF: string;
        currentUnit?: string; // Add currentUnit property
      };
      phaseC: {
        mA: string;
        nF: string;
        currentUnit?: string; // Add currentUnit property
      };
    }>;
  };
}

// Get temperature correction factor
const getTCF = (celsius: number): number => {
  // Temperature correction factors based on 20°C reference temperature
  const tempFactors = [
    { temp: -24, factor: 0.054 },
    { temp: -23, factor: 0.068 },
    { temp: -22, factor: 0.082 },
    { temp: -21, factor: 0.096 },
    { temp: -20, factor: 0.11 },
    { temp: -19, factor: 0.124 },
    { temp: -18, factor: 0.138 },
    { temp: -17, factor: 0.152 },
    { temp: -16, factor: 0.166 },
    { temp: -15, factor: 0.18 },
    { temp: -14, factor: 0.194 },
    { temp: -13, factor: 0.208 },
    { temp: -12, factor: 0.222 },
    { temp: -11, factor: 0.236 },
    { temp: -10, factor: 0.25 },
    { temp: -9, factor: 0.264 },
    { temp: -8, factor: 0.278 },
    { temp: -7, factor: 0.292 },
    { temp: -6, factor: 0.306 },
    { temp: -5, factor: 0.32 },
    { temp: -4, factor: 0.336 },
    { temp: -3, factor: 0.352 },
    { temp: -2, factor: 0.368 },
    { temp: -1, factor: 0.384 },
    { temp: 0, factor: 0.4 },
    { temp: 1, factor: 0.42 },
    { temp: 2, factor: 0.44 },
    { temp: 3, factor: 0.46 },
    { temp: 4, factor: 0.48 },
    { temp: 5, factor: 0.5 },
    { temp: 6, factor: 0.526 },
    { temp: 7, factor: 0.552 },
    { temp: 8, factor: 0.578 },
    { temp: 9, factor: 0.604 },
    { temp: 10, factor: 0.63 },
    { temp: 11, factor: 0.666 },
    { temp: 12, factor: 0.702 },
    { temp: 13, factor: 0.738 },
    { temp: 14, factor: 0.774 },
    { temp: 15, factor: 0.81 },
    { temp: 16, factor: 0.848 },
    { temp: 17, factor: 0.886 },
    { temp: 18, factor: 0.924 },
    { temp: 19, factor: 0.962 },
    { temp: 20, factor: 1.0 }, // Reference temperature
    { temp: 21, factor: 1.05 },
    { temp: 22, factor: 1.1 },
    { temp: 23, factor: 1.15 },
    { temp: 24, factor: 1.2 },
    { temp: 25, factor: 1.25 },
    { temp: 26, factor: 1.316 },
    { temp: 27, factor: 1.382 },
    { temp: 28, factor: 1.448 },
    { temp: 29, factor: 1.514 },
    { temp: 30, factor: 1.58 },
    { temp: 31, factor: 1.664 },
    { temp: 32, factor: 1.748 },
    { temp: 33, factor: 1.832 },
    { temp: 34, factor: 1.872 },
    { temp: 35, factor: 2.0 },
    { temp: 36, factor: 2.1 },
    { temp: 37, factor: 2.2 },
    { temp: 38, factor: 2.3 },
    { temp: 39, factor: 2.4 },
    { temp: 40, factor: 2.5 },
    { temp: 41, factor: 2.628 },
    { temp: 42, factor: 2.756 },
    { temp: 43, factor: 2.884 },
    { temp: 44, factor: 3.012 },
    { temp: 45, factor: 3.15 },
    { temp: 46, factor: 3.316 },
    { temp: 47, factor: 3.482 },
    { temp: 48, factor: 3.648 },
    { temp: 49, factor: 3.814 },
    { temp: 50, factor: 3.98 },
    { temp: 51, factor: 4.184 },
    { temp: 52, factor: 4.388 },
    { temp: 53, factor: 4.592 },
    { temp: 54, factor: 4.796 },
    { temp: 55, factor: 5.0 },
    { temp: 56, factor: 5.26 },
    { temp: 57, factor: 5.52 },
    { temp: 58, factor: 5.78 },
    { temp: 59, factor: 6.04 },
    { temp: 60, factor: 6.3 },
    { temp: 61, factor: 6.62 },
    { temp: 62, factor: 6.94 },
    { temp: 63, factor: 7.26 },
    { temp: 64, factor: 7.58 },
    { temp: 65, factor: 7.9 },
    { temp: 66, factor: 8.32 },
    { temp: 67, factor: 8.74 },
    { temp: 68, factor: 9.16 },
    { temp: 69, factor: 9.58 },
    { temp: 70, factor: 10.0 },
    { temp: 71, factor: 10.52 },
    { temp: 72, factor: 11.04 },
    { temp: 73, factor: 11.56 },
    { temp: 74, factor: 12.08 },
    { temp: 75, factor: 12.6 },
    { temp: 76, factor: 13.24 },
    { temp: 77, factor: 13.88 },
    { temp: 78, factor: 14.52 },
    { temp: 79, factor: 15.16 },
    { temp: 80, factor: 15.8 },
    { temp: 81, factor: 16.64 },
    { temp: 82, factor: 17.48 },
    { temp: 83, factor: 18.32 },
    { temp: 84, factor: 19.16 },
    { temp: 85, factor: 20.0 },
    { temp: 86, factor: 21.04 },
    { temp: 87, factor: 22.08 },
    { temp: 88, factor: 23.12 },
    { temp: 89, factor: 24.16 },
    { temp: 90, factor: 25.2 },
    { temp: 91, factor: 26.45 },
    { temp: 92, factor: 27.7 },
    { temp: 93, factor: 28.95 },
    { temp: 94, factor: 30.2 },
    { temp: 95, factor: 31.6 },
    { temp: 96, factor: 33.28 },
    { temp: 97, factor: 34.96 },
    { temp: 98, factor: 36.64 },
    { temp: 99, factor: 38.32 },
    { temp: 100, factor: 40.0 },
    { temp: 101, factor: 42.08 },
    { temp: 102, factor: 44.16 },
    { temp: 103, factor: 46.24 },
    { temp: 104, factor: 48.32 },
    { temp: 105, factor: 50.4 },
    { temp: 106, factor: 52.96 },
    { temp: 107, factor: 55.52 },
    { temp: 108, factor: 58.08 },
    { temp: 109, factor: 60.64 },
    { temp: 110, factor: 63.2 }
  ];
  
  // Find exact match or interpolate
  const exactMatch = tempFactors.find(tf => tf.temp === celsius);
  if (exactMatch) return exactMatch.factor;
  
  // Interpolate between closest values
  const lowerFactor = tempFactors.filter(tf => tf.temp < celsius).pop();
  const upperFactor = tempFactors.find(tf => tf.temp > celsius);
  
  if (!lowerFactor || !upperFactor) {
    // Outside range, use closest value
    return tempFactors.reduce((prev, curr) => 
      Math.abs(curr.temp - celsius) < Math.abs(prev.temp - celsius) ? curr : prev
    ).factor;
  }
  
  // Linear interpolation
  const range = upperFactor.temp - lowerFactor.temp;
  const ratio = (celsius - lowerFactor.temp) / range;
  return lowerFactor.factor + ratio * (upperFactor.factor - lowerFactor.factor);
};

const MediumVoltageVLFReport: React.FC = () => {
  const params = useParams<{ id?: string; jobId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';

  // State for IDs, loading, saving, edit mode, and errors
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [reportId, setReportId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'medium-voltage-vlf'; // This component handles the medium-voltage-vlf route
  const reportName = getReportName(reportSlug);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // Default to view mode
  const [error, setError] = useState<string | null>(null);
  
  // Parse URL for jobId and reportId on mount and path change
  useEffect(() => {
    console.log('Parsing URL:', location.pathname);
    const pathParts = location.pathname.split('/').filter(part => part !== ''); // Remove empty parts
    const jobsIndex = pathParts.findIndex(part => part === 'jobs');
    let extractedJobId: string | undefined = undefined;
    let extractedReportId: string | undefined = undefined;

    if (jobsIndex !== -1 && jobsIndex + 1 < pathParts.length) {
      extractedJobId = pathParts[jobsIndex + 1];
      console.log('Extracted Job ID:', extractedJobId);
      // Check if there's a report ID after the job ID and report type
      // Example: /jobs/{jobId}/medium-voltage-vlf-report/{reportId}
      if (jobsIndex + 3 < pathParts.length) {
         extractedReportId = pathParts[jobsIndex + 3];
         console.log('Extracted Report ID:', extractedReportId);
      } else {
         console.log('No Report ID found in URL path.');
      }
    } else {
      console.error('Could not find /jobs/ structure in URL path.');
    }

    setJobId(extractedJobId);
    setReportId(extractedReportId);
    setIsEditMode(!extractedReportId); // Set edit mode if no report ID is found

  }, [location.pathname]);
  
  // Debug information for troubleshooting
  console.log('Component Initialization:');
  console.log('- URL params:', params);
  console.log('- reportId:', reportId);
  console.log('- jobId from params:', params.jobId);
  console.log('- jobId extracted:', jobId);
  console.log('- pathname:', location.pathname);
  console.log('- search params:', location.search);
  console.log('- user:', user ? `Authenticated as ${user.email}` : 'Not authenticated');
  console.log('- isEditMode:', isEditMode);
  
  // Initialize form data
  const [formData, setFormData] = useState<MediumVoltageVLFReportForm>({
    reportInfo: {
      title: "",
      date: "",
      location: "",
      technicians: [],
      reportNumber: "",
      customerName: "",
      customerContactName: "",
      customerContactEmail: "",
      customerContactPhone: "",
    },
    status: TestStatus.PASS,
    customerName: "",
    siteAddress: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    jobNumber: "",
    identifier: "",
    testedBy: "",
    testDate: "",
    location: "",         // Initialize substation field
    equipmentLocation: "", // Initialize equipment location field
    cableType: "",
    operatingVoltage: "",
    cableLength: "",
    
    // Cable information
    cableInfo: {
      description: "",
      size: "",
      length: "",
      voltageRating: "",
      insulation: "",
      yearInstalled: "",
      testedFrom: "",  // Changed from testedFrom
      testedTo: "",    // Changed from testedTo
      from: "",        // Separate from field
      to: "",          // Separate to field
      manufacturer: "",
      insulationThickness: "",
      conductorMaterial: "",
    },
    
    // Termination data
    terminationData: {
      terminationData: "",
      ratedVoltage: "",
      terminationData2: "",
      ratedVoltage2: "",
      from: "",
      to: "",
    },
    
    // Visual and Mechanical Inspection
    visualInspection: {
      compareData: InspectionResult.SELECT,           // 7.3.3.A.1
      inspectDamage: InspectionResult.SELECT,         // 7.3.3.A.2
      useOhmmeter: InspectionResult.SELECT,           // 7.3.3.A.3.1
      inspectConnectors: InspectionResult.SELECT,     // 7.3.3.A.4
      inspectGrounding: InspectionResult.SELECT,      // 7.3.3.A.5
      verifyBends: InspectionResult.SELECT,           // 7.3.3.A.6
      inspectCurrentTransformers: InspectionResult.SELECT, // 7.3.3.A.8
      inspectIdentification: InspectionResult.SELECT, // 7.3.3.A.9
      inspectJacket: InspectionResult.SELECT,         // 7.3.3.A.10
    },
    
    // Electrical Tests - Shield Continuity
    shieldContinuity: {
      phaseA: "",
      phaseB: "",
      phaseC: "",
      unit: "Ω", // Default unit
    },
    
    // Electrical Tests - Insulation Resistance
    insulationTest: {
      testVoltage: "1000",
      unit: "GΩ", // Default unit
      preTest: {
        ag: "",
        bg: "",
        cg: "",
      },
      postTest: {
        ag: "",
        bg: "",
        cg: "",
      },
      preTestCorrected: {
        ag: "",
        bg: "",
        cg: "",
      },
      postTestCorrected: {
        ag: "",
        bg: "",
        cg: "",
      },
    },
    
    // Test Equipment
    equipment: {
      ohmmeter: "",
      ohmSerialNumber: "",
      megohmmeter: "",
      megohmSerialNumber: "",
      vlfHipot: "",
      vlfSerialNumber: "",
      ampId: "",
      vlfTestSet: "", // Add this field to maintain compatibility with existing code
    },
    
    // Temperature correction data
    temperature: {
      fahrenheit: 68,
      celsius: 20,
      humidity: 0,
      tcf: 1.000
    },
    
    // Comments
    comments: "",
    
    // For backward compatibility
    testEquipment: {
      vlf: "",
      vlfCalibrationDate: "",
      insulationTester: "",
      insulationTesterCalibrationDate: "",
    },
    vlfTests: [],
    insulationResistanceTests: [],
    voltageBreakdownChart: null,
    voltageBreakdownPreview: "",
    testConditions: {
      weatherConditions: "",
      temperature: "",
      humidity: "",
      cableCondition: "",
    },
    conclusion: "",
    recommendations: "",
    testEngineer: "",
    clientRepresentative: "",
    reportDate: "",
    equipmentType: "",
    equipmentInfo: {
      type: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      ratingKV: "",
      ratingKVA: "",
      installationDate: "",
      lastMaintenanceDate: "",
    },
    testData: {
      testVoltage: "",
      testDuration: "",
      frequency: "",
      leakageCurrentPhaseA: "",
      leakageCurrentPhaseB: "",
      leakageCurrentPhaseC: "",
    },
    testResults: {
      summary: "",
      phaseAStatus: "",
      phaseBStatus: "",
      phaseCStatus: "",
      overallResult: "",
      recommendedActions: "",
    },
    notes: "",
    signatures: {
      technicianSignature: "",
      customerSignature: "",
    },
    
    // Electrical Tests Withstand Test
    withstandTest: {
      readings: [
        { 
          timeMinutes: "10", 
          kVAC: "", 
          phaseA: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseB: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseC: { mA: "", nF: "", currentUnit: "mA" } 
        },
        { 
          timeMinutes: "20", 
          kVAC: "", 
          phaseA: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseB: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseC: { mA: "", nF: "", currentUnit: "mA" } 
        },
        { 
          timeMinutes: "30", 
          kVAC: "", 
          phaseA: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseB: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseC: { mA: "", nF: "", currentUnit: "mA" } 
        },
        { 
          timeMinutes: "40", 
          kVAC: "", 
          phaseA: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseB: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseC: { mA: "", nF: "", currentUnit: "mA" } 
        },
        { 
          timeMinutes: "50", 
          kVAC: "", 
          phaseA: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseB: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseC: { mA: "", nF: "", currentUnit: "mA" } 
        },
        { 
          timeMinutes: "60", 
          kVAC: "", 
          phaseA: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseB: { mA: "", nF: "", currentUnit: "mA" }, 
          phaseC: { mA: "", nF: "", currentUnit: "mA" } 
        },
      ]
    },
  });

  // Check for returnToAssets query parameter
  const returnToAssets = new URLSearchParams(location.search).get('returnToAssets') === 'true';

  // Fix useEffect to handle data loading with better sequence control
  useEffect(() => {
    console.log('Data loading useEffect triggered. Current state:', { jobId, reportId, loading, error });

    // Don't proceed if already in an error state or if path isn't ready
    if (error || !location.pathname) {
      console.log('Exiting useEffect early due to existing error or missing pathname.');
      // Ensure loading is false if we exit due to error
      if (loading) setLoading(false);
      return;
    }

    const loadData = async () => {
      // Set loading true ONLY when we start fetching inside loadData
      setLoading(true); 
      try {
        // --- Job Info Loading --- 
    if (jobId) {
          console.log('Attempting to load Job Info for jobId:', jobId);
          await loadJobInfo(jobId);
          console.log('Job info loaded successfully.');
        } else {
          // If there's no jobId *and* no reportId, it's an invalid state
          if (!reportId) {
             console.error('Critical error: No jobId found after URL parsing, and no reportId exists.');
             setError('Missing job ID. Please navigate back to the job and try again.');
             // No need to proceed further
             return; 
          }
          // If only reportId exists, we might be loading an existing report without job context (less common, but handle)
          console.log('No jobId found, but reportId exists. Proceeding to load report.');
        }

        // --- Report Loading --- 
    if (reportId) {
          console.log('Attempting to load Report for reportId:', reportId);
          await loadReport(); // loadReport now handles its own errors/state
          console.log('Report loading process completed.');
    } else {
          // No reportId means we are creating a new report
          console.log('No reportId found, setting edit mode for new report.');
          setIsEditMode(true);
        }

      } catch (err) {
        // Catch errors from loadJobInfo or loadReport if they re-throw
        console.error('Error caught during loadData execution:', err);
        // Error state/toast is likely already set within loadJobInfo/loadReport
        if (!error) { // Set a generic error if one wasn't set specifically
           setError(`Error loading data: ${(err as Error).message}`);
        }
      } finally {
        // Ensure loading is always set to false after attempts
        console.log('loadData finally block: Setting loading to false.');
      setLoading(false);
    }
    };

    // Only run loadData if we potentially have an ID to work with
    // or if the component just mounted and needs initial setup.
    // The jobId dependency handles the case where jobId updates after mount.
    if (jobId !== undefined || reportId !== undefined) {
       // Moved setLoading(true) inside loadData
       loadData();
    } else {
       // If both are undefined after initial parse, we are not loading yet.
       console.log('Waiting for jobId/reportId state update... Loading set to false for now.');
       setLoading(false); // Explicitly set loading false if we don't run loadData
    }

  }, [jobId, reportId, location.pathname]); // Keep error out of dependencies

  // Load job information with improved data handling
  const loadJobInfo = async (currentJobId: string) => {
    if (!currentJobId) {
      console.log('loadJobInfo: No jobId provided');
      setError('No job ID was provided. Please go back and try again.');
      return;
    }
    
    console.log('loadJobInfo: Started for jobId:', currentJobId);
    
    try {
      console.log('Fetching job data from neta_ops.jobs table');
      
      // First check if the database/schema is accessible
      const { data: schemaCheck, error: schemaError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('id')
        .limit(1);
      
      if (schemaError) {
        console.error('Database schema access error:', schemaError);
        throw new Error('Could not connect to the database. Please try again later.');
      }
      
      // Now fetch the actual job data - match the field structure from DryTypeTransformerReport.tsx
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select(`
          title,
          job_number,
          customer_id
        `)
        .eq('id', currentJobId)
        .single();

      if (jobError) {
        console.error('loadJobInfo: Error fetching job data:', jobError);
        
        // Check error type to provide better error messages
        if (jobError.code === 'PGRST116') {
          throw new Error(`Job with ID ${currentJobId} not found. Please verify the job exists.`);
        } else {
          throw jobError;
        }
      }

      console.log('loadJobInfo: Fetched job data:', jobData);

      // Initialize customer info with default values
        let customerName = '';
        let customerAddress = '';
      
      // Then fetch customer data from common schema if customer_id exists
      if (jobData?.customer_id) {
        console.log('loadJobInfo: Fetching customer data for customer_id:', jobData.customer_id);
        
        try {
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
            
          if (customerError) {
            console.error('loadJobInfo: Error fetching customer data:', customerError);
          } else if (customerData) {
            console.log('loadJobInfo: Fetched customer data:', customerData);
            customerName = customerData.company_name || customerData.name || '';
            customerAddress = customerData.address || '';
          }
        } catch (customerErr) {
          // Just log the error but continue - we can still create a report without customer data
          console.error('Error fetching customer data:', customerErr);
        }
      } else {
        console.log('Job has no customer_id, skipping customer data fetch');
      }

      console.log('loadJobInfo: Setting form data with job and customer info');
      
      // Create a consolidated update object with the correct field mappings
      const updatedFormData = {
          jobNumber: jobData.job_number || '',
          jobTitle: jobData.title || '',
          customerName: customerName,
        siteAddress: customerAddress,
        contactPerson: '',
        // Since location and equipment_location fields don't exist in the jobs table,
        // we'll leave these blank or use defaults
        location: '',
        equipmentLocation: '',
        testDate: new Date().toISOString().split('T')[0],
        reportInfo: {
          title: jobData.title || '',
          customerName: customerName,
          customerContactName: ''
        }
      };
      
      // Update all form data at once to prevent partial updates
    setFormData(prev => ({
      ...prev,
        ...updatedFormData
      }));
      
      // Verify the update with a delay to ensure state has updated
      setTimeout(() => {
        console.log('Job and customer info applied to form data:', formData);
      }, 100);
    } catch (error) {
      console.error('loadJobInfo: Error loading job info:', error);
      setError(`Failed to load job info: ${(error as Error).message}`);
      toast.error(`Failed to load job info: ${(error as Error).message}`);
      throw error; // Re-throw so parent can handle
    }
  };

  // Generic change handler for form fields
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle VLF test changes
  const handleVLFTestChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const updatedTests = [...(prev.vlfTests || [])];
      updatedTests[index] = {
        ...updatedTests[index],
        [field]: value
      };
      return {
        ...prev,
        vlfTests: updatedTests
      };
    });
  };

  // Handle insulation test change
  const handleInsulationTestChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const updatedTests = [...(prev.insulationResistanceTests || [])];
      updatedTests[index] = {
        ...updatedTests[index],
        [field]: value
      };
      return {
        ...prev,
        insulationResistanceTests: updatedTests
      };
    });
  };

  // Add a new VLF test
  const addVLFTest = () => {
    setFormData(prev => ({
      ...prev,
      vlfTests: [
        ...(prev.vlfTests || []),
        {
          testVoltage: '',
          duration: '',
          phase: CablePhase.A,
          result: 'PASS',
          notes: ''
        }
      ]
    }));
  };
  
  // Remove a VLF test
  const removeVLFTest = (index: number) => {
    if (!formData.vlfTests || formData.vlfTests.length <= 1) return;
    
    setFormData(prev => ({
      ...prev,
      vlfTests: prev.vlfTests ? prev.vlfTests.filter((_, i) => i !== index) : []
    }));
  };

  // Add insulation resistance test
  const addInsulationTest = () => {
    setFormData(prev => ({
      ...prev,
      insulationResistanceTests: [
        ...(prev.insulationResistanceTests || []),
        {
          phase: CablePhase.A,
          testVoltage: '',
          oneMinuteReading: '',
          tenMinuteReading: '',
          piRatio: ''
        }
      ]
    }));
  };

  // Remove an insulation resistance test
  const removeInsulationTest = (index: number) => {
    if (!formData.insulationResistanceTests || formData.insulationResistanceTests.length <= 1) return;
    
    setFormData(prev => ({
      ...prev,
      insulationResistanceTests: prev.insulationResistanceTests ? prev.insulationResistanceTests.filter((_, i) => i !== index) : []
    }));
  };

  // Update temperature correction factors
  const updateCorrectedValues = () => {
    const { insulationTest, temperature } = formData;
    
    if (!insulationTest) return;
    
    // Calculate pre-test corrected values
    const preTestCorrected = {
      ag: calculateCorrectedValue(insulationTest.preTest.ag, temperature.tcf),
      bg: calculateCorrectedValue(insulationTest.preTest.bg, temperature.tcf),
      cg: calculateCorrectedValue(insulationTest.preTest.cg, temperature.tcf)
    };
    
    // Calculate post-test corrected values
    const postTestCorrected = {
      ag: calculateCorrectedValue(insulationTest.postTest.ag, temperature.tcf),
      bg: calculateCorrectedValue(insulationTest.postTest.bg, temperature.tcf),
      cg: calculateCorrectedValue(insulationTest.postTest.cg, temperature.tcf)
    };
    
    // Update form data with corrected values
    setFormData(prev => ({
      ...prev,
      insulationTest: {
        ...prev.insulationTest,
        preTestCorrected,
        postTestCorrected
      }
    }));
  };

  // Helper function to calculate corrected value
  const calculateCorrectedValue = (value: string, tcf: number): string => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '';
    return (numValue * tcf).toFixed(2);
  };

  // Handle insulation test value change
  const handleInsulationTestValueChange = (testType: 'preTest' | 'postTest' | 'preTestCorrected' | 'postTestCorrected', field: string, value: string) => {
    // Only allow direct editing of non-corrected fields, 
    // corrected fields should be calculated automatically
    if (testType === 'preTestCorrected' || testType === 'postTestCorrected') {
      // For corrected fields, just update the value directly
      setFormData(prev => ({
        ...prev,
        insulationTest: {
          ...prev.insulationTest,
          [testType]: {
            ...prev.insulationTest[testType],
            [field]: value
          }
        }
      }));
      return;
    }
    
    // For non-corrected fields, update the value and calculate the corrected value
    setFormData(prev => {
      // First update the test value
      const updatedTest = {
        ...prev.insulationTest,
        [testType]: {
          ...prev.insulationTest[testType],
          [field]: value
        }
      };
      
      // Calculate corrected value for this field
      const correctedField = `${testType}Corrected`;
      const correctedValue = calculateCorrectedValue(value, prev.temperature.tcf);
      
      // Update corrected value
      updatedTest[correctedField] = {
        ...prev.insulationTest[correctedField],
        [field]: correctedValue
      };
      
      return {
        ...prev,
        insulationTest: updatedTest
      };
    });
  };

  // Handle Fahrenheit temperature change
  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = Math.round((fahrenheit - 32) * 5 / 9);
    
    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        fahrenheit: fahrenheit,
        celsius: celsius
      }
    }));
  };

  // Handle Celsius temperature change
  const handleCelsiusChange = (celsius: number) => {
    const fahrenheit = Math.round(celsius * 9 / 5 + 32);
    
    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        celsius: celsius,
        fahrenheit: fahrenheit
      }
    }));
  };

  // Handle withstand test change
  const handleWithstandTestChange = (index: number, field: string, value: string, phase?: string, subfield?: string) => {
    setFormData(prev => {
      const readings = [...(prev.withstandTest?.readings || [])];
      
      if (phase && subfield) {
        // Update subfield for a specific phase
        readings[index] = {
          ...readings[index],
          [phase]: {
            ...readings[index][phase],
            [subfield]: value
          }
        };
      } else {
        // Update main field
        readings[index] = {
          ...readings[index],
          [field]: value
        };
      }
      
      return {
        ...prev,
        withstandTest: {
          ...prev.withstandTest,
          readings
        }
      };
    });
  };

  // Save report
  const handleSave = async () => {
    console.log('Save button clicked');
    console.log('Current jobId:', jobId);
    console.log('Current location.pathname:', location.pathname);
    
    // Final attempt to get jobId if not available in state
    const effectiveJobId = jobId || location.pathname.split('/jobs/')[1]?.split('/')[0];
    
    // Check if we have the necessary information
    if (!effectiveJobId) {
      console.log('Save failed: Missing jobId');
      toast.error('Missing job ID. Please try again from the job page.');
      return;
    }
    
    if (!user?.id) {
      console.log('Save failed: Missing user.id');
      toast.error('You must be logged in to save a report.');
      return;
    }
    
    if (!isEditMode) {
      console.log('Save failed: Not in edit mode');
      toast.error('The report is not in edit mode.');
      return;
    }

    try {
      console.log('Starting save process with jobId:', effectiveJobId);
      console.log('Current user ID:', user.id);
      setIsSaving(true);
      
      // First, check if we can access the table at all (permission check)
      try {
        console.log('Testing table access permission...');
        const { data: permTest, error: permError } = await supabase
          .schema('neta_ops')
          .from('medium_voltage_vlf_reports')
          .select('id')
          .limit(1);
          
        if (permError) {
          console.error('Permission test failed:', permError);
          if (permError.message.includes('permission denied')) {
            toast.error('You do not have permission to access this data. Please contact your administrator.');
            return;
          }
        }
        console.log('Permission test result:', permTest ? 'Success' : 'No data returned');
      } catch (permTestError) {
        console.error('Permission test exception:', permTestError);
      }
      
      const reportData = {
        job_id: effectiveJobId,
        user_id: user.id,
        report_info: {
          title: formData.reportInfo.title,
          date: formData.reportInfo.date,
          location: formData.reportInfo.location,
          technicians: formData.reportInfo.technicians,
          reportNumber: formData.reportInfo.reportNumber,
          customerName: formData.reportInfo.customerName,
          customerContactName: formData.reportInfo.customerContactName,
          customerContactEmail: formData.reportInfo.customerContactEmail,
          customerContactPhone: formData.reportInfo.customerContactPhone,
          jobNumber: formData.jobNumber,
          identifier: formData.identifier,
          status: formData.status
        },
        cable_info: formData.cableInfo,
        termination_data: formData.terminationData,
        visual_inspection: formData.visualInspection,
        shield_continuity: formData.shieldContinuity,
        insulation_test: formData.insulationTest,
        equipment: formData.equipment,
        temperature: formData.temperature,
        withstand_test: formData.withstandTest,
        comments: formData.comments,
        status: formData.status
      };
      
      let result;
      if (reportId) {
        // Update existing report
        console.log('Updating existing report with ID:', reportId);
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_vlf_reports')
          .update(reportData)
          .eq('id', reportId)
          .select()
          .single();
        // Fallback: If update failed due to table/column mismatch or RLS, try legacy table using JSONB 'data'
        if (result.error) {
          console.warn('Primary update failed, attempting fallback to medium_voltage_cable_vlf_test:', result.error);
          const { data: fbData, error: fbError } = await supabase
            .schema('neta_ops')
            .from('medium_voltage_cable_vlf_test')
            .update({ data: formData, updated_at: new Date().toISOString() })
            .eq('id', reportId)
            .select('id')
            .single();
          if (fbError) {
            console.error('Fallback update failed as well:', fbError);
            throw fbError;
          }
          result = { data: fbData, error: null } as any;
        }
      } else {
        // Create new report
        console.log('Creating new report...');
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_vlf_reports')
          .insert(reportData)
          .select()
          .single();
        
        console.log('Report creation result:', result);
        // If primary insert failed, fallback to legacy table using JSONB 'data'
        if (result.error) {
          console.warn('Primary insert failed, attempting fallback to medium_voltage_cable_vlf_test:', result.error);
          const { data: fbData, error: fbError } = await supabase
            .schema('neta_ops')
            .from('medium_voltage_cable_vlf_test')
            .insert({ job_id: effectiveJobId, user_id: user.id, data: formData, created_at: new Date().toISOString() })
            .select('id')
            .single();
          if (fbError) {
            console.error('Fallback insert failed as well:', fbError);
            throw fbError;
          }
          result = { data: fbData, error: null } as any;
        }

        // Create asset entry
        if (result.data) {
          console.log('Creating asset entry for report:', result.data.id);
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.equipmentLocation || ''),
            file_url: `report:/jobs/${effectiveJobId}/medium-voltage-vlf/${result.data.id}`,
            user_id: user.id
          };
          
          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();
            
          if (assetError) {
            console.error('Error creating asset:', assetError);
            if (assetError.message.includes('permission denied')) {
              toast.error('You do not have permission to create assets. Please contact your administrator.');
              // We still saved the report, so consider it partial success
              setIsEditMode(false);
              toast.success(`Report saved, but could not create asset due to permissions.`);
              navigateAfterSave(navigate, effectiveJobId, location);
              return;
            }
            throw assetError;
          }

          console.log('Asset creation result:', assetResult);
          console.log('Linking asset to job...');
          // Link asset to job
          const { data: linkResult, error: linkError } = await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({
              job_id: effectiveJobId,
              asset_id: assetResult.id,
              user_id: user.id
            });
            
          if (linkError) {
            console.error('Error linking asset to job:', linkError);
            if (linkError.message.includes('permission denied')) {
              toast.error('You do not have permission to link assets to jobs. Please contact your administrator.');
              // We still saved the report and created the asset, so consider it partial success
              setIsEditMode(false);
              toast.success(`Report and asset saved, but could not link asset to job due to permissions.`);
              navigateAfterSave(navigate, effectiveJobId, location);
              return;
            }
          }
          console.log('Asset linked to job successfully');
        }
      }

      if (result.error) {
        console.error('Error in main report operation:', result.error);
        if (result.error.message.includes('permission denied')) {
          toast.error('You do not have permission to save this report. Please contact your administrator.');
          return;
        }
        throw result.error;
      }

      setIsEditMode(false);
      toast.success(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, effectiveJobId, location);
    } catch (error: any) {
      console.error('Error saving report:', error);
      if (error.message && error.message.includes('permission denied')) {
        toast.error(`Permission denied: You don't have the required access rights. Please contact your administrator.`);
      } else {
        toast.error(`Failed to save report: ${error?.message || 'Unknown error'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Update temperature correction factor when celsius value changes
  useEffect(() => {
    const tcf = getTCF(formData.temperature.celsius);
    
    setFormData(prev => ({
      ...prev,
      temperature: {
        ...prev.temperature,
        tcf
      }
    }));
    
    // Update corrected values
    updateCorrectedValues();
  }, [formData.temperature.celsius, formData.insulationResistanceTests]);

  // Load existing report
  const loadReport = async () => {
    if (!reportId) {
      console.log('loadReport: No reportId provided, setting edit mode.');
      setLoading(false);
      setIsEditMode(true);
      return;
    }

    console.log('loadReport: Started for reportId:', reportId);
    setLoading(true);

    try {
      console.log(`Attempting to load report from 'neta_ops.medium_voltage_vlf_reports' table`);
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('medium_voltage_vlf_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (!error && data) {
        console.log('loadReport: Found report in new table, applying mappings.');
        setFormData(prev => ({
          ...prev,
          // High-level info
          ...(data.report_info || {}),
          customerName: data.report_info?.customerName || prev.customerName,
          siteAddress: data.report_info?.siteAddress || prev.siteAddress,
          jobNumber: data.report_info?.jobNumber || prev.jobNumber,
          location: data.report_info?.location || prev.location,
          equipmentLocation: data.report_info?.equipmentLocation || prev.equipmentLocation,
          contactPerson: data.report_info?.contactPerson || prev.contactPerson,
          identifier: data.report_info?.identifier || prev.identifier,
          // Structured sections from top-level columns
          cableInfo: data.cable_info || prev.cableInfo,
          terminationData: data.termination_data || prev.terminationData,
          visualInspection: data.visual_inspection || prev.visualInspection,
          shieldContinuity: data.shield_continuity || prev.shieldContinuity,
          insulationTest: data.insulation_test || prev.insulationTest,
          equipment: data.equipment || prev.equipment,
          temperature: data.temperature || prev.temperature,
          withstandTest: data.withstand_test || prev.withstandTest,
          comments: data.comments ?? prev.comments,
          status: data.status || prev.status,
          // Nested reportInfo
          reportInfo: {
            ...prev.reportInfo,
            ...(data.report_info?.reportInfo || {})
          }
        }));
        setIsEditMode(false);
        return;
      }

      // Primary table failed or empty; try legacy table
      console.warn('Primary load failed or empty, trying legacy table medium_voltage_cable_vlf_test:', error);
      const { data: legacyData, error: legacyError } = await supabase
        .schema('neta_ops')
        .from('medium_voltage_cable_vlf_test')
        .select('id, data')
        .eq('id', reportId)
        .single();

      if (legacyError) {
        console.error('Legacy table load failed:', legacyError);
        if (error) {
          // Report the original error contextually
          if ((error as any).message?.includes('permission denied')) {
            toast.error('Permission denied when loading the report.');
          } else if ((error as any).code === 'PGRST116') {
            toast.error('Report not found.');
          } else {
            toast.error(`Failed to load report: ${(error as any).message}`);
          }
        } else {
          toast.error(`Failed to load report: ${legacyError.message}`);
        }
        throw legacyError;
      }

      if (legacyData && legacyData.data) {
        console.log('Loaded report from legacy table; applying JSON form data.');
        setFormData(prev => ({
          ...prev,
          ...(legacyData.data || {})
        }));
        setIsEditMode(false);
      } else {
        console.warn('Legacy report has no data payload.');
        toast.error('Loaded report seems incomplete.');
      }

    } catch (error) {
      console.error('loadReport: CATCH block - Error loading report:', error);
      // Error is already toasted inside the try block
      // Don't automatically set edit mode on load errors - let user click Edit if needed
    } finally {
      console.log('loadReport: Finished, setting loading=false');
      setLoading(false);
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p>Loading report...</p>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center max-w-md p-6">
          <div className="text-red-500 text-xl mb-4">Error</div>
          <p className="mb-6">{error}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(`/jobs/${jobId || ''}?tab=assets`)}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md"
            >
              Return to Job
            </button>
            {error.includes('database') && (
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  // Force reload of the data
                  setTimeout(() => window.location.reload(), 500);
                }}
                className="px-4 py-2 mt-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-md"
              >
                Retry Connection
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render header function
  const renderHeader = () => (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (isEditMode) {
              setFormData(prev => ({ ...prev, status: prev.status === TestStatus.PASS ? TestStatus.FAIL : TestStatus.PASS }))
            }
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            formData.status === TestStatus.PASS
              ? 'bg-green-600 text-white focus:ring-green-500'
              : 'bg-red-600 text-white focus:ring-red-500'
          } ${!isEditMode ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
        >
          {formData.status}
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
            onClick={(e) => {
              e.preventDefault(); // Prevent any default behavior
              console.log('Save button clicked directly');
              console.log('Current params:', params);
              console.log('Current reportId:', reportId);
              console.log('Current jobId:', jobId);
              console.log('Current edit mode:', isEditMode);
              try {
                // First try normal save
                if (jobId) {
                  handleSave();
                } else {
                  console.log('No jobId found, using fallback extraction');
                  // Extract jobId from URL path as fallback
                  const extractedJobId = location.pathname.split('/jobs/')[1]?.split('/')[0];
                  if (extractedJobId) {
                    console.log('Fallback - extracted jobId from URL:', extractedJobId);
                    // Set the jobId and then try to save
                    setJobId(extractedJobId);
                    // Give the state time to update
                    setTimeout(() => {
                      handleSave();
                    }, 100);
                  } else {
                    toast.error('Could not find job ID in URL');
                  }
                }
              } catch (error) {
                console.error('Error during save:', error);
              }
            }}
            disabled={!isEditMode || isSaving}
            className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditMode ? 'hidden' : 'hover:bg-orange-700 disabled:opacity-50'}`}
          >
            {isSaving ? 'Saving...' : reportId ? 'Update Report' : 'Save Report'}
          </button>
        )}
      </div>
    </div>
  );
  
  // Render component UI here
  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right">
          <div className="font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
            NETA - ATS 7.3.3
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
                  border: formData.status === TestStatus.PASS ? '2px solid #16a34a' : '2px solid #dc2626',
                  backgroundColor: formData.status === TestStatus.PASS ? '#22c55e' : '#ef4444',
                  color: 'white',
                }}
              >
                {formData.status === TestStatus.PASS ? 'PASS' : 'FAIL'}
              </div>
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

      {/* Job Information */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2">
          {/* Left Column */}
            <div className="md:col-span-2 space-y-2">
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Customer</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input
                type="text"
                  value={formData.customerName}
                  onChange={(e) => handleChange('customerName', e.target.value)}
                readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
              />
            </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Site Address</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input
                type="text"
                  value={formData.siteAddress}
                  onChange={(e) => handleChange('siteAddress', e.target.value)}
                readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
              />
            </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">User</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => handleChange('contactPerson', e.target.value)}
                readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
              />
            </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Date</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input
                  type="date"
                  value={formData.testDate}
                  onChange={(e) => handleChange('testDate', e.target.value)}
                  readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
                />
              </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Identifier</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input
                type="text"
                value={formData.identifier || ''}
                onChange={(e) => {
                  console.log('Setting identifier to:', e.target.value);
                  handleChange('identifier', e.target.value);
                }}
                readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
                  placeholder="Enter an identifier for this cable"
              />
            </div>
          </div>
          </div>
          
          {/* Right Column */}
            <div className="md:col-span-2 space-y-2">
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Job #</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input
                type="text"
                  value={formData.jobNumber || ''}
                  onChange={(e) => handleChange('jobNumber', e.target.value)}
                readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
              />
            </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Technicians</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input
                  type="text"
                  value={formData.testedBy}
                  onChange={(e) => handleChange('testedBy', e.target.value)}
                readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
              />
            </div>
            </div>
            
            <div className="mb-4 flex items-center">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Temp.</label>
              <div className="flex-1 flex items-center">
                <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                <input
                  type="number"
                  value={formData.temperature?.fahrenheit || 68}
                    onChange={(e) => handleFahrenheitChange(Number(e.target.value))}
                  readOnly={!isEditMode}
                    className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
                />
              </div>
                <span className="mx-2">°F</span>
                <span className="mx-2">{formData.temperature?.celsius || 20}</span>
                <span className="mx-2">°C</span>
                
                <span className="mx-5">TCF</span>
                <div className="w-16 border-b border-gray-300 dark:border-gray-600">
                  <input
                    type="text"
                    value={formData.temperature?.tcf.toFixed(3) || '1.000'}
                    readOnly={true}
                    className="w-full bg-transparent border-none focus:ring-0 cursor-default"
                  />
                </div>
              </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Humidity</label>
              <div className="flex items-center flex-1">
                <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input
                  type="number"
                    value={formData.temperature?.humidity || 0}
                    onChange={(e) => handleChange('temperature', {...formData.temperature, humidity: Number(e.target.value)})}
                  readOnly={!isEditMode}
                    className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
                />
              </div>
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Substation</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={(e) => handleChange('location', e.target.value)}
                  readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
                />
              </div>
            </div>
            
            <div className="mb-4 flex">
              <label className="inline-block w-20 font-medium text-gray-700 dark:text-gray-300">Eqpt. Location</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input
                  type="text"
                  value={formData.equipmentLocation || ''}
                  onChange={(e) => handleChange('equipmentLocation', e.target.value)}
                  readOnly={!isEditMode}
                  className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Cable Information */}
      <section className="mb-6 cable-termination-section">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Cable & Termination Data</h2>
        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Tested From</label>
                <input
                  type="text"
                  value={formData.cableInfo?.testedFrom || ''}
                  onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, testedFrom: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300"></label>
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer</label>
                <input
                  type="text"
                  value={formData.cableInfo?.manufacturer || ''}
                  onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, manufacturer: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Cable Rated Voltage (kV)</label>
                <input
                  type="text"
                value={formData.cableInfo?.voltageRating || ''}
                onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, voltageRating: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Cable Type</label>
                <input
                  type="text"
                  value={formData.cableType || ''}
                  onChange={(e) => handleChange('cableType', e.target.value)}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Length (ft)</label>
                <input
                  type="text"
                value={formData.cableLength || ''}
                onChange={(e) => handleChange('cableLength', e.target.value)}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Conductor Size</label>
                <input
                  type="text"
                value={formData.cableInfo?.size || ''}
                onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, size: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Insulation Type</label>
                <input
                  type="text"
                value={formData.cableInfo?.insulation || ''}
                onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, insulation: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Conductor Material</label>
                <input
                  type="text"
                value={formData.cableInfo?.conductorMaterial || ''}
                onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, conductorMaterial: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Insulation Thickness</label>
                <input
                  type="text"
                  value={formData.cableInfo?.insulationThickness || ''}
                  onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, insulationThickness: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">From</label>
                <input
                  type="text"
                value={formData.cableInfo?.from || ''}
                onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, from: e.target.value})}
                readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">To</label>
                <input
                  type="text"
                value={formData.cableInfo?.to || ''}
                onChange={(e) => handleChange('cableInfo', {...formData.cableInfo, to: e.target.value})}
                readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
          </div>
          
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Termination Data</label>
                <input
                  type="text"
                value={formData.terminationData?.terminationData || ''}
                onChange={(e) => handleChange('terminationData', {...formData.terminationData, terminationData: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Termination Data</label>
                <input
                  type="text"
                value={formData.terminationData?.terminationData2 || ''}
                onChange={(e) => handleChange('terminationData', {...formData.terminationData, terminationData2: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Rated Voltage (kV)</label>
                <input
                  type="text"
                value={formData.terminationData?.ratedVoltage || ''}
                onChange={(e) => handleChange('terminationData', {...formData.terminationData, ratedVoltage: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
            <div className="flex items-center">
              <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">Rated Voltage (kV)</label>
                <input
                  type="text"
                value={formData.terminationData?.ratedVoltage2 || ''}
                onChange={(e) => handleChange('terminationData', {...formData.terminationData, ratedVoltage2: e.target.value})}
                  readOnly={!isEditMode}
                className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
            </div>
          </div>
        </div>
      </section>

      {/* Visual and Mechanical Inspection */}
      <section className="mb-6 visual-mechanical-inspection">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">7.3.3.A Visual and Mechanical Inspection</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 vm-standard table-fixed">
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '62%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">NETA Section</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Result</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.1</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Compare cable data with drawings and specifications.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.compareData || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, compareData: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.2</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Inspect exposed sections of cables for physical damage.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.inspectDamage || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, inspectDamage: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.3.1</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Use of a low-resistance ohmmeter in accordance with Section 7.3.3.B.1.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.useOhmmeter || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, useOhmmeter: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.4</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Inspect compression-applied connectors for correct cable match and indentation.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.inspectConnectors || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, inspectConnectors: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.5</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Inspect shield grounding, cable supports, and terminations.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.inspectGrounding || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, inspectGrounding: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.6</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Verify that visible cable bends meet or exceed ICEA and manufacturer's minimum published bending radius.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.verifyBends || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, verifyBends: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.8</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">If cables are terminated through window-type current transformers, inspect to verify that neutral and ground conductors are correctly placed and that shields are correctly terminated for operation of protective devices.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.inspectCurrentTransformers || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, inspectCurrentTransformers: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.9</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Inspect for correct identification and arrangements.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.inspectIdentification || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, inspectIdentification: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>

              <tr>
                <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">7.3.3.A.10</td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Inspect cable jacket and insulation condition.</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={formData.visualInspection?.inspectJacket || InspectionResult.SELECT}
                    onChange={(e) => handleChange('visualInspection', { ...formData.visualInspection, inspectJacket: e.target.value as InspectionResult })}
                    disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {Object.values(InspectionResult).map((result) => (
                      <option key={result} value={result}>{result}</option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Electrical Tests - Shield Continuity */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Shield Continuity</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
            <thead>
              <tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">A Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">B Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">C Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Units</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.shieldContinuity.phaseA}
                    onChange={(e) => handleChange('shieldContinuity', {...formData.shieldContinuity, phaseA: e.target.value})}
              readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.shieldContinuity.phaseB}
                    onChange={(e) => handleChange('shieldContinuity', {...formData.shieldContinuity, phaseB: e.target.value})}
              readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.shieldContinuity.phaseC}
                    onChange={(e) => handleChange('shieldContinuity', {...formData.shieldContinuity, phaseC: e.target.value})}
                    readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
              <select
                    value={formData.shieldContinuity.unit}
                    onChange={(e) => handleChange('shieldContinuity', {...formData.shieldContinuity, unit: e.target.value})}
                disabled={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {continuityUnits.map(unit => (
                      <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
                    ))}
              </select>
                </td>
              </tr>
            </tbody>
          </table>
            </div>
      </section>

      {/* Electrical Tests - Insulation Resistance Values */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Insulation Resistance Values</h2>
        <div className="mb-4 flex items-center">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Test Voltage:</label>
              <select
            value={formData.insulationTest.testVoltage}
            onChange={(e) => handleChange('insulationTest', {...formData.insulationTest, testVoltage: e.target.value})}
                disabled={!isEditMode}
            className={`w-32 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          >
            {insulationTestVoltages.map(option => (
              <option key={option.value} value={option.value} className="dark:bg-dark-100 dark:text-white">{option.label}</option>
            ))}
              </select>
          <span className="ml-2 text-gray-900 dark:text-white">V</span>
            </div>
        
        <div className="overflow-x-auto section-insulation-resistance">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700 table-fixed">
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-gray-300 dark:border-gray-700 px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-20"> </th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={3}>Insulation Resistance</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={3}>Temperature Corrected</th>
                <th className="border border-gray-300 dark:border-gray-700 px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">Units</th>
              </tr>
              <tr>
                <th className="border border-gray-300 dark:border-gray-700 px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"></th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">A-G</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">B-G</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">C-G</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">A-G</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">B-G</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">C-G</th>
                <th className="border border-gray-300 dark:border-gray-700 px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 dark:border-gray-700 px-2 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-white">Pre-Test</td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.preTest.ag}
                    onChange={(e) => handleInsulationTestValueChange('preTest', 'ag', e.target.value)}
                    readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.preTest.bg}
                    onChange={(e) => handleInsulationTestValueChange('preTest', 'bg', e.target.value)}
                    readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.preTest.cg}
                    onChange={(e) => handleInsulationTestValueChange('preTest', 'cg', e.target.value)}
                    readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.preTestCorrected.ag}
                    readOnly={true}
                    className="w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm dark:bg-dark-100 dark:text-white bg-gray-100 dark:bg-dark-200"
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.preTestCorrected.bg}
                    readOnly={true}
                    className="w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm dark:bg-dark-100 dark:text-white bg-gray-100 dark:bg-dark-200"
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.preTestCorrected.cg}
                    readOnly={true}
                    className="w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm dark:bg-dark-100 dark:text-white bg-gray-100 dark:bg-dark-200"
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{formData.insulationTest.unit}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 dark:border-gray-700 px-2 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-white">Post-Test</td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.postTest.ag}
                    onChange={(e) => handleInsulationTestValueChange('postTest', 'ag', e.target.value)}
                    readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.postTest.bg}
                    onChange={(e) => handleInsulationTestValueChange('postTest', 'bg', e.target.value)}
                    readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.postTest.cg}
                    onChange={(e) => handleInsulationTestValueChange('postTest', 'cg', e.target.value)}
                    readOnly={!isEditMode}
                    className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.postTestCorrected.ag}
                    readOnly={true}
                    className="w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm dark:bg-dark-100 dark:text-white bg-gray-100 dark:bg-dark-200"
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.postTestCorrected.bg}
                    readOnly={true}
                    className="w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm dark:bg-dark-100 dark:text-white bg-gray-100 dark:bg-dark-200"
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <input
                    type="text"
                    value={formData.insulationTest.postTestCorrected.cg}
                    readOnly={true}
                    className="w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm dark:bg-dark-100 dark:text-white bg-gray-100 dark:bg-dark-200"
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{formData.insulationTest.unit}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        {/* Add unit dropdown at the bottom of the table */}
        <div className="mt-2 flex justify-end items-center">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Units:</label>
              <select
            value={formData.insulationTest.unit}
            onChange={(e) => handleChange('insulationTest', {...formData.insulationTest, unit: e.target.value})}
                disabled={!isEditMode}
            className={`w-32 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          >
            {insulationUnits.map(unit => (
              <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
            ))}
              </select>
            </div>
      </section>

      {/* Electrical Tests Withstand Test */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests Withstand Test</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
            <thead>
              <tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time(min)</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">kVAC</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={2}>A Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={2}>B Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={2}>C Phase</th>
              </tr>
              <tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2"></th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2"></th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <select
                    onChange={(e) => {
                      const newReadings = [...formData.withstandTest.readings];
                      newReadings.forEach(reading => {
                        reading.phaseA.currentUnit = e.target.value;
                      });
                      handleChange('withstandTest', { readings: newReadings });
                    }}
                    value={formData.withstandTest.readings[0]?.phaseA?.currentUnit || 'mA'}
                disabled={!isEditMode}
                    className={`w-16 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-xs dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {currentUnits.map(unit => (
                      <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
                    ))}
              </select>
                </th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">nF</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <select
                    onChange={(e) => {
                      const newReadings = [...formData.withstandTest.readings];
                      newReadings.forEach(reading => {
                        reading.phaseB.currentUnit = e.target.value;
                      });
                      handleChange('withstandTest', { readings: newReadings });
                    }}
                    value={formData.withstandTest.readings[0]?.phaseB?.currentUnit || 'mA'}
                    disabled={!isEditMode}
                    className={`w-16 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-xs dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {currentUnits.map(unit => (
                      <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
                    ))}
                  </select>
                </th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">nF</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <select
                    onChange={(e) => {
                      const newReadings = [...formData.withstandTest.readings];
                      newReadings.forEach(reading => {
                        reading.phaseC.currentUnit = e.target.value;
                      });
                      handleChange('withstandTest', { readings: newReadings });
                    }}
                    value={formData.withstandTest.readings[0]?.phaseC?.currentUnit || 'mA'}
                    disabled={!isEditMode}
                    className={`w-16 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-xs dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  >
                    {currentUnits.map(unit => (
                      <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
                    ))}
                  </select>
                </th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">nF</th>
              </tr>
            </thead>
            <tbody>
              {formData.withstandTest?.readings.map((reading, index) => (
                <tr key={index}>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value={reading.timeMinutes}
                      onChange={(e) => handleWithstandTestChange(index, 'timeMinutes', e.target.value)}
              readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
            <input
              type="text"
                      value={reading.kVAC}
                      onChange={(e) => handleWithstandTestChange(index, 'kVAC', e.target.value)}
              readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
            <input
              type="text"
                      value={reading.phaseA?.mA || ''}
                      onChange={(e) => handleWithstandTestChange(index, 'phaseA', e.target.value, 'phaseA', 'mA')}
              readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
            <input
              type="text"
                      value={reading.phaseA?.nF || ''}
                      onChange={(e) => handleWithstandTestChange(index, 'phaseA', e.target.value, 'phaseA', 'nF')}
              readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
            <input
              type="text"
                      value={reading.phaseB?.mA || ''}
                      onChange={(e) => handleWithstandTestChange(index, 'phaseB', e.target.value, 'phaseB', 'mA')}
              readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value={reading.phaseB?.nF || ''}
                      onChange={(e) => handleWithstandTestChange(index, 'phaseB', e.target.value, 'phaseB', 'nF')}
                      readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value={reading.phaseC?.mA || ''}
                      onChange={(e) => handleWithstandTestChange(index, 'phaseC', e.target.value, 'phaseC', 'mA')}
                      readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value={reading.phaseC?.nF || ''}
                      onChange={(e) => handleWithstandTestChange(index, 'phaseC', e.target.value, 'phaseC', 'nF')}
                      readOnly={!isEditMode}
                      className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Test Equipment Used */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ohmmeter</label>
            <input
              type="text"
              value={formData.equipment?.ohmmeter || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, ohmmeter: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
            <input
              type="text"
              value={formData.equipment?.ohmSerialNumber || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, ohmSerialNumber: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label>
            <input
              type="text"
              value={formData.equipment?.ampId || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, ampId: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Megohmmeter</label>
            <input
              type="text"
              value={formData.equipment?.megohmmeter || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, megohmmeter: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
            <input
              type="text"
              value={formData.equipment?.megohmSerialNumber || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, megohmSerialNumber: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label>
            <input
              type="text"
              value={formData.equipment?.ampId || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, ampId: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">VLF Hipot</label>
            <input
              type="text"
              value={formData.equipment?.vlfHipot || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, vlfHipot: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
            <input
              type="text"
              value={formData.equipment?.vlfSerialNumber || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, vlfSerialNumber: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label>
            <input
              type="text"
              value={formData.equipment?.ampId || ''}
              onChange={(e) => handleChange('equipment', {...formData.equipment, ampId: e.target.value})}
              readOnly={!isEditMode}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
        </div>
      </section>
      
      {/* Comments */}
      <section className="mb-6 comments-section">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
        <div>
          <textarea
            value={formData.comments || ''}
            onChange={(e) => handleChange('comments', e.target.value)}
            readOnly={!isEditMode}
            rows={6}
            className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white resize-vertical ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          />
        </div>
      </section>
        </div>
      </div>
    </ReportWrapper>
  );
}

export default MediumVoltageVLFReport;

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
      
      table { border-collapse: collapse; width: 100%; table-layout: fixed !important; }
      th, td { border: 1px solid black !important; padding: 4px !important; word-break: break-word !important; }
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
      
      /* Ensure all text is black for maximum readability */
      * { color: black !important; }
      /* Comments section wider, not taller */
      .comments-section textarea { width: 100% !important; max-width: 100% !important; min-width: 100% !important; height: 90px !important; }

      /* Visual & Mechanical: narrow ID, wide description */
      .visual-mechanical-inspection table th:first-child,
      .visual-mechanical-inspection table td:first-child { width: 8% !important; min-width: 60px !important; }
      .visual-mechanical-inspection table th:nth-child(2),
      .visual-mechanical-inspection table td:nth-child(2) { width: 50% !important; min-width: 200px !important; }
      .visual-mechanical-inspection table th:nth-child(3),
      .visual-mechanical-inspection table td:nth-child(3) { width: 20% !important; min-width: 100px !important; }
      .visual-mechanical-inspection table th:nth-child(4),
      .visual-mechanical-inspection table td:nth-child(4) { width: 22% !important; min-width: 120px !important; }

      /* Cable & Termination (acts as Nameplate Data): ensure full visibility */
      .cable-termination-section .grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; column-gap: 12px !important; row-gap: 6px !important; }
      .cable-termination-section label { width: 35% !important; display: inline-block !important; font-size: 10px !important; }
      .cable-termination-section input { width: 65% !important; font-size: 10px !important; padding: 0 !important; margin: 0 !important; background: transparent !important; border: none !important; border-bottom: 1px solid black !important; height: 14px !important; box-shadow: none !important; }
      .cable-termination-section .flex.items-center { align-items: baseline !important; }

      /* PASS/FAIL print status box - standardized like other reports */
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
    }
  `;
  document.head.appendChild(style);
} 
