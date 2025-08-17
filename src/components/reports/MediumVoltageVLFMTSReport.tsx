import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useUser } from '@supabase/auth-helpers-react';
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

interface MediumVoltageVLFMTSReportForm {
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
    testedFrom?: string;
    testedTo?: string;
    from?: string;
    to?: string;
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
    inspectCablesAndConnectors: InspectionResult;
    inspectTerminationsAndSplices: InspectionResult;
    useOhmmeter: InspectionResult;
    inspectShieldGrounding: InspectionResult;
    verifyBendRadius: InspectionResult;
    inspectCurrentTransformers: InspectionResult;
    comments: string;
  };
  
  // Electrical Tests - Shield Continuity
  shieldContinuity: {
    phaseA: string;
    phaseB: string;
    phaseC: string;
    unit: string;
  };
  
  // Electrical Tests - Insulation Resistance Values
  insulationTest: {
    testVoltage: string;
    unit: string;
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
    vlfTestSet?: string;
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
  
  // For backward compatibility (can be pruned if not strictly needed for new report type)
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
        currentUnit?: string;
      };
      phaseB: {
        mA: string;
        nF: string;
        currentUnit?: string;
      };
      phaseC: {
        mA: string;
        nF: string;
        currentUnit?: string;
      };
    }>;
  };
}

// Get temperature correction factor
const getTCF = (celsius: number): number => {
  const tempFactors = [
    { temp: -24, factor: 0.054 }, { temp: -23, factor: 0.068 }, { temp: -22, factor: 0.082 },
    { temp: -21, factor: 0.096 }, { temp: -20, factor: 0.11  }, { temp: -19, factor: 0.124 },
    { temp: -18, factor: 0.138 }, { temp: -17, factor: 0.152 }, { temp: -16, factor: 0.166 },
    { temp: -15, factor: 0.18  }, { temp: -14, factor: 0.194 }, { temp: -13, factor: 0.208 },
    { temp: -12, factor: 0.222 }, { temp: -11, factor: 0.236 }, { temp: -10, factor: 0.25  },
    { temp: -9, factor: 0.264 }, { temp: -8, factor: 0.278 }, { temp: -7, factor: 0.292 },
    { temp: -6, factor: 0.306 }, { temp: -5, factor: 0.32  }, { temp: -4, factor: 0.336 },
    { temp: -3, factor: 0.352 }, { temp: -2, factor: 0.368 }, { temp: -1, factor: 0.384 },
    { temp: 0, factor: 0.4   }, { temp: 1, factor: 0.42  }, { temp: 2, factor: 0.44  },
    { temp: 3, factor: 0.46  }, { temp: 4, factor: 0.48  }, { temp: 5, factor: 0.5   },
    { temp: 6, factor: 0.526 }, { temp: 7, factor: 0.552 }, { temp: 8, factor: 0.578 },
    { temp: 9, factor: 0.604 }, { temp: 10, factor: 0.63  }, { temp: 11, factor: 0.666 },
    { temp: 12, factor: 0.702 }, { temp: 13, factor: 0.738 }, { temp: 14, factor: 0.774 },
    { temp: 15, factor: 0.81  }, { temp: 16, factor: 0.848 }, { temp: 17, factor: 0.886 },
    { temp: 18, factor: 0.924 }, { temp: 19, factor: 0.962 }, { temp: 20, factor: 1.0   }, // Reference
    { temp: 21, factor: 1.05  }, { temp: 22, factor: 1.1   }, { temp: 23, factor: 1.15  },
    { temp: 24, factor: 1.2   }, { temp: 25, factor: 1.25  }, { temp: 26, factor: 1.316 },
    { temp: 27, factor: 1.382 }, { temp: 28, factor: 1.448 }, { temp: 29, factor: 1.514 },
    { temp: 30, factor: 1.58  }, { temp: 31, factor: 1.664 }, { temp: 32, factor: 1.748 },
    { temp: 33, factor: 1.832 }, { temp: 34, factor: 1.872 }, { temp: 35, factor: 2.0   },
    { temp: 36, factor: 2.1   }, { temp: 37, factor: 2.2   }, { temp: 38, factor: 2.3   },
    { temp: 39, factor: 2.4   }, { temp: 40, factor: 2.5   }, { temp: 41, factor: 2.628 },
    { temp: 42, factor: 2.756 }, { temp: 43, factor: 2.884 }, { temp: 44, factor: 3.012 },
    { temp: 45, factor: 3.15  }, { temp: 46, factor: 3.316 }, { temp: 47, factor: 3.482 },
    { temp: 48, factor: 3.648 }, { temp: 49, factor: 3.814 }, { temp: 50, factor: 3.98  },
    { temp: 51, factor: 4.184 }, { temp: 52, factor: 4.388 }, { temp: 53, factor: 4.592 },
    { temp: 54, factor: 4.796 }, { temp: 55, factor: 5.0   }, { temp: 56, factor: 5.26  },
    { temp: 57, factor: 5.52  }, { temp: 58, factor: 5.78  }, { temp: 59, factor: 6.04  },
    { temp: 60, factor: 6.3   }, { temp: 61, factor: 6.62  }, { temp: 62, factor: 6.94  },
    { temp: 63, factor: 7.26  }, { temp: 64, factor: 7.58  }, { temp: 65, factor: 7.9   },
    { temp: 66, factor: 8.32  }, { temp: 67, factor: 8.74  }, { temp: 68, factor: 9.16  },
    { temp: 69, factor: 9.58  }, { temp: 70, factor: 10.0  }, { temp: 71, factor: 10.52 },
    { temp: 72, factor: 11.04 }, { temp: 73, factor: 11.56 }, { temp: 74, factor: 12.08 },
    { temp: 75, factor: 12.6  }, { temp: 76, factor: 13.24 }, { temp: 77, factor: 13.88 },
    { temp: 78, factor: 14.52 }, { temp: 79, factor: 15.16 }, { temp: 80, factor: 15.8  },
    { temp: 81, factor: 16.64 }, { temp: 82, factor: 17.48 }, { temp: 83, factor: 18.32 },
    { temp: 84, factor: 19.16 }, { temp: 85, factor: 20.0  }, { temp: 86, factor: 21.04 },
    { temp: 87, factor: 22.08 }, { temp: 88, factor: 23.12 }, { temp: 89, factor: 24.16 },
    { temp: 90, factor: 25.2  }, { temp: 91, factor: 26.45 }, { temp: 92, factor: 27.7  },
    { temp: 93, factor: 28.95 }, { temp: 94, factor: 30.2  }, { temp: 95, factor: 31.6  },
    { temp: 96, factor: 33.28 }, { temp: 97, factor: 34.96 }, { temp: 98, factor: 36.64 },
    { temp: 99, factor: 38.32 }, { temp: 100, factor: 40.0 }, { temp: 101, factor: 42.08 },
    { temp: 102, factor: 44.16 }, { temp: 103, factor: 46.24 }, { temp: 104, factor: 48.32 },
    { temp: 105, factor: 50.4  }, { temp: 106, factor: 52.96 }, { temp: 107, factor: 55.52 },
    { temp: 108, factor: 58.08 }, { temp: 109, factor: 60.64 }, { temp: 110, factor: 63.2  }
  ];
  
  const exactMatch = tempFactors.find(tf => tf.temp === celsius);
  if (exactMatch) return exactMatch.factor;
  
  const lowerFactor = tempFactors.filter(tf => tf.temp < celsius).pop();
  const upperFactor = tempFactors.find(tf => tf.temp > celsius);
  
  if (!lowerFactor || !upperFactor) {
    return tempFactors.reduce((prev, curr) => 
      Math.abs(curr.temp - celsius) < Math.abs(prev.temp - celsius) ? curr : prev
    ).factor;
  }
  
  const range = upperFactor.temp - lowerFactor.temp;
  const ratio = (celsius - lowerFactor.temp) / range;
  return lowerFactor.factor + ratio * (upperFactor.factor - lowerFactor.factor);
};

const MediumVoltageVLFMTSReport: React.FC = () => {
  const params = useParams<{ id?: string; jobId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Print Mode Detection
  const isPrintMode = searchParams.get('print') === 'true';

  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [reportId, setReportId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'medium-voltage-vlf-mts-report'; // This component handles the medium-voltage-vlf-mts-report route
  const reportName = getReportName(reportSlug);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const pathParts = location.pathname.split('/').filter(part => part !== '');
    const jobsIndex = pathParts.findIndex(part => part === 'jobs');
    let extractedJobId: string | undefined = undefined;
    let extractedReportId: string | undefined = undefined;

    if (jobsIndex !== -1 && jobsIndex + 1 < pathParts.length) {
      extractedJobId = pathParts[jobsIndex + 1];
      // Example: /jobs/{jobId}/medium-voltage-vlf-mts-report/{reportId}
      if (jobsIndex + 3 < pathParts.length) {
         extractedReportId = pathParts[jobsIndex + 3];
      }
    }

    setJobId(extractedJobId);
    setReportId(extractedReportId);
    setIsEditMode(!extractedReportId);
  }, [location.pathname]);
  
  const [formData, setFormData] = useState<MediumVoltageVLFMTSReportForm>({
    reportInfo: {
      title: "MEDIUM VOLTAGE CABLE VLF TEST REPORT MTS",
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
    location: "",
    equipmentLocation: "",
    cableType: "",
    operatingVoltage: "",
    cableLength: "",
    cableInfo: {
      description: "", size: "", length: "", voltageRating: "", insulation: "", yearInstalled: "",
      testedFrom: "", testedTo: "", from: "", to: "", manufacturer: "", insulationThickness: "", conductorMaterial: "",
    },
    terminationData: {
      terminationData: "", ratedVoltage: "", terminationData2: "", ratedVoltage2: "", from: "", to: "",
    },
    visualInspection: {
      inspectCablesAndConnectors: InspectionResult.SELECT,
      inspectTerminationsAndSplices: InspectionResult.SELECT,
      useOhmmeter: InspectionResult.SELECT,
      inspectShieldGrounding: InspectionResult.SELECT,
      verifyBendRadius: InspectionResult.SELECT,
      inspectCurrentTransformers: InspectionResult.SELECT,
      comments: ""
    },
    shieldContinuity: { phaseA: "", phaseB: "", phaseC: "", unit: "Ω" },
    insulationTest: {
      testVoltage: "1000", unit: "GΩ",
      preTest: { ag: "", bg: "", cg: "" }, postTest: { ag: "", bg: "", cg: "" },
      preTestCorrected: { ag: "", bg: "", cg: "" }, postTestCorrected: { ag: "", bg: "", cg: "" },
    },
    equipment: {
      ohmmeter: "", ohmSerialNumber: "", megohmmeter: "", megohmSerialNumber: "",
      vlfHipot: "", vlfSerialNumber: "", ampId: "", vlfTestSet: "",
    },
    temperature: { fahrenheit: 68, celsius: 20, humidity: 0, tcf: 1.000 },
    comments: "",
    testEquipment: { vlf: "", vlfCalibrationDate: "", insulationTester: "", insulationTesterCalibrationDate: "" },
    vlfTests: [],
    insulationResistanceTests: [],
    withstandTest: {
      readings: [
        { timeMinutes: "10", kVAC: "", phaseA: { mA: "", nF: "", currentUnit: "mA" }, phaseB: { mA: "", nF: "", currentUnit: "mA" }, phaseC: { mA: "", nF: "", currentUnit: "mA" } },
        { timeMinutes: "20", kVAC: "", phaseA: { mA: "", nF: "", currentUnit: "mA" }, phaseB: { mA: "", nF: "", currentUnit: "mA" }, phaseC: { mA: "", nF: "", currentUnit: "mA" } },
        { timeMinutes: "30", kVAC: "", phaseA: { mA: "", nF: "", currentUnit: "mA" }, phaseB: { mA: "", nF: "", currentUnit: "mA" }, phaseC: { mA: "", nF: "", currentUnit: "mA" } },
        { timeMinutes: "40", kVAC: "", phaseA: { mA: "", nF: "", currentUnit: "mA" }, phaseB: { mA: "", nF: "", currentUnit: "mA" }, phaseC: { mA: "", nF: "", currentUnit: "mA" } },
        { timeMinutes: "50", kVAC: "", phaseA: { mA: "", nF: "", currentUnit: "mA" }, phaseB: { mA: "", nF: "", currentUnit: "mA" }, phaseC: { mA: "", nF: "", currentUnit: "mA" } },
        { timeMinutes: "60", kVAC: "", phaseA: { mA: "", nF: "", currentUnit: "mA" }, phaseB: { mA: "", nF: "", currentUnit: "mA" }, phaseC: { mA: "", nF: "", currentUnit: "mA" } },
      ]
    },
  });

  useEffect(() => {
    if (error || !location.pathname) {
      if (loading) setLoading(false);
      return;
    }
    const loadData = async () => {
      setLoading(true);
      try {
        if (jobId) {
          await loadJobInfo(jobId);
        }
        if (reportId) {
          await loadReport();
        } else {
          setIsEditMode(true);
        }
      } catch (err) {
        if (!error) setError(`Error loading data: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    };
    if (jobId !== undefined || reportId !== undefined) {
       loadData();
    } else {
       setLoading(false);
    }
  }, [jobId, reportId, location.pathname]);

  const loadJobInfo = async (currentJobId: string) => {
    if (!currentJobId) {
      setError('No job ID was provided.'); return;
    }
    try {
      const { data: jobData, error: jobError } = await supabase.schema('neta_ops').from('jobs').select('title,job_number,customer_id').eq('id', currentJobId).single();
      if (jobError) throw jobError;
      let customerName = '', customerAddress = '';
      if (jobData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase.schema('common').from('customers').select('name,company_name,address').eq('id', jobData.customer_id).single();
        if (!customerError && customerData) {
          customerName = customerData.company_name || customerData.name || '';
          customerAddress = customerData.address || '';
        }
      }
      setFormData(prev => ({
        ...prev,
        jobNumber: jobData.job_number || '',
        customerName: customerName,
        siteAddress: customerAddress,
        testDate: prev.testDate || new Date().toISOString().split('T')[0],
        reportInfo: { ...prev.reportInfo, title: jobData.title || '', customerName: customerName }
      }));
    } catch (error) {
      setError(`Failed to load job info: ${(error as Error).message}`);
      toast.error(`Failed to load job info: ${(error as Error).message}`);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleInsulationTestValueChange = (testType: 'preTest' | 'postTest' | 'preTestCorrected' | 'postTestCorrected', field: string, value: string) => {
    if (testType === 'preTestCorrected' || testType === 'postTestCorrected') {
      setFormData(prev => ({ ...prev, insulationTest: { ...prev.insulationTest, [testType]: { ...prev.insulationTest[testType], [field]: value }}}));
      return;
    }
    setFormData(prev => {
      const updatedTest = { ...prev.insulationTest, [testType]: { ...prev.insulationTest[testType], [field]: value }};
      const correctedField = `${testType}Corrected`;
      const correctedValue = calculateCorrectedValue(value, prev.temperature.tcf);
      updatedTest[correctedField] = { ...prev.insulationTest[correctedField], [field]: correctedValue };
      return { ...prev, insulationTest: updatedTest };
    });
  };

  const calculateCorrectedValue = (value: string, tcf: number): string => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return '';
    return (numValue * tcf).toFixed(2);
  };

  useEffect(() => {
    const tcf = getTCF(formData.temperature.celsius);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, tcf }}));
    updateCorrectedValues(); 
  }, [formData.temperature.celsius]);

  const updateCorrectedValues = () => {
    const { insulationTest, temperature } = formData;
    if (!insulationTest) return;
    const preTestCorrected = {
      ag: calculateCorrectedValue(insulationTest.preTest.ag, temperature.tcf),
      bg: calculateCorrectedValue(insulationTest.preTest.bg, temperature.tcf),
      cg: calculateCorrectedValue(insulationTest.preTest.cg, temperature.tcf)
    };
    const postTestCorrected = {
      ag: calculateCorrectedValue(insulationTest.postTest.ag, temperature.tcf),
      bg: calculateCorrectedValue(insulationTest.postTest.bg, temperature.tcf),
      cg: calculateCorrectedValue(insulationTest.postTest.cg, temperature.tcf)
    };
    setFormData(prev => ({ ...prev, insulationTest: { ...prev.insulationTest, preTestCorrected, postTestCorrected }}));
  };

  const handleFahrenheitChange = (fahrenheit: number) => {
    const celsius = Math.round((fahrenheit - 32) * 5 / 9);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit, celsius }}));
  };

  const handleCelsiusChange = (celsius: number) => {
    const fahrenheit = Math.round(celsius * 9 / 5 + 32);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, celsius, fahrenheit }}));
  };

  const handleWithstandTestChange = (index: number, field: string, value: string, phase?: string, subfield?: string) => {
    setFormData(prev => {
      const readings = [...(prev.withstandTest?.readings || [])];
      if (phase && subfield) {
        readings[index] = { ...readings[index], [phase]: { ...readings[index][phase], [subfield]: value }};
      } else {
        readings[index] = { ...readings[index], [field]: value };
      }
      return { ...prev, withstandTest: { ...prev.withstandTest, readings }};
    });
  };

  const handleSave = async () => {
    const effectiveJobId = jobId || location.pathname.split('/jobs/')[1]?.split('/')[0];
    if (!effectiveJobId || !user?.id || !isEditMode) {
      toast.error('Cannot save: Missing job ID, user ID, or not in edit mode.');
      return;
    }
    setIsSaving(true);
    try {
      const reportData = {
        data: formData,
        job_id: effectiveJobId,
        user_id: user.id
      };
      let result;
      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_vlf_mts_reports')
          .update(reportData)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('medium_voltage_vlf_mts_reports')
          .insert(reportData)
          .select()
          .single();
        
        if (result.data) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.equipmentLocation || ''),
            file_url: `report:/jobs/${effectiveJobId}/medium-voltage-vlf-mts-report/${result.data.id}`,
            user_id: user.id
          };
          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();
            
          if (assetError) throw assetError;
          
          await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({
              job_id: effectiveJobId,
              asset_id: assetResult.id,
              user_id: user.id
            });
        }
      }
      if (result.error) throw result.error;
      setIsEditMode(false);
      toast.success(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, effectiveJobId, location);
    } catch (error: any) {
      toast.error(`Failed to save report: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const loadReport = async () => {
    if (!reportId) {
      setIsEditMode(true); // New report, start in edit mode (this is correct for new reports)
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('medium_voltage_vlf_mts_reports')
        .select('*')
        .eq('id', reportId)
        .single();
        
      if (error) throw error;
      
      if (data && data.data) {
        setFormData(prev => ({
          ...prev,
          ...data.data
        }));
        // Set status from loaded data
        if (data.data.status) {
          setFormData(prev => ({ ...prev, status: data.data.status as TestStatus }));
        }
        setIsEditMode(false);
      } else {
        toast.error('Loaded report seems incomplete.');
        // Don't automatically set edit mode for incomplete data - let user click Edit if needed
      }
    } catch (error) {
      toast.error(`Failed to load report: ${(error as Error).message}`);
      // Don't automatically set edit mode on load errors - let user click Edit if needed
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><div className="spinner mb-4"></div><p>Loading report...</p></div>;
if (error) return <div className="flex justify-center items-center h-screen"><div className="text-center max-w-md p-6"><div className="text-red-500 text-xl mb-4">Error</div><p className="mb-6">{error}</p><button onClick={() => navigate(`/jobs/${jobId || ''}?tab=assets`)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md">Return to Job</button></div></div>;

  const renderHeader = () => (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex gap-2">
        <button
          onClick={() => { if (isEditMode) setFormData(prev => ({ ...prev, status: prev.status === TestStatus.PASS ? TestStatus.FAIL : TestStatus.PASS }))}}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${formData.status === TestStatus.PASS ? 'bg-green-600 text-white focus:ring-green-500' : 'bg-red-600 text-white focus:ring-red-500'} ${!isEditMode ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
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
            onClick={handleSave}
            disabled={!isEditMode || isSaving}
            className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${(!isEditMode || isSaving) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#f26722]/90'} ${isSaving ? 'animate-pulse' : ''}`}
          >
            {isSaving ? 'Saving...' : (reportId ? 'Update Report' : 'Save Report')}
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
          NETA - MTS 7.3.3
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
                border: formData.status === TestStatus.PASS ? '2px solid #16a34a' : '2px solid #dc2626',
                backgroundColor: formData.status === TestStatus.PASS ? '#22c55e' : '#ef4444',
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

      {/* Job Information */}
      <section className="mb-6 job-info-section">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2">
            <div> {/* Left Column */}
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Customer</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={formData.customerName} onChange={(e) => handleChange('customerName', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Site Address</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={formData.siteAddress} onChange={(e) => handleChange('siteAddress', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">User</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input type="text" value={formData.contactPerson} onChange={(e) => handleChange('contactPerson', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Date</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input type="date" value={formData.testDate} onChange={(e) => handleChange('testDate', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Identifier</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={formData.identifier || ''} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`} placeholder="Enter an identifier for this cable"/>
            </div></div>
          </div>
            <div> {/* Right Column */}
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Job #</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={formData.jobNumber || ''} onChange={(e) => handleChange('jobNumber', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Technicians</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
              <input type="text" value={formData.testedBy} onChange={(e) => handleChange('testedBy', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
            <div className="mb-4 flex items-center">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Temp.</label>
              <div className="flex-1 flex items-center">
                <div className="w-16 border-b border-gray-300 dark:border-gray-600"><input type="number" value={formData.temperature?.fahrenheit || 68} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/></div>
                <span className="mx-2">°F</span> <span className="mx-2">{formData.temperature?.celsius || 20}</span> <span className="mx-2">°C</span>
                <span className="mx-5">TCF</span> <div className="w-16 border-b border-gray-300 dark:border-gray-600"><input type="text" value={formData.temperature?.tcf.toFixed(3) || '1.000'} readOnly={true} className="w-full bg-transparent border-none focus:ring-0 cursor-default"/></div>
              </div></div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Humidity</label>
              <div className="flex items-center flex-1"><div className="flex-1 border-b border-gray-300 dark:border-gray-600"><input type="number" value={formData.temperature?.humidity || 0} onChange={(e) => handleChange('temperature', {...formData.temperature, humidity: Number(e.target.value)})} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/></div><span className="ml-2">%</span></div>
            </div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Substation</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input type="text" value={formData.location || ''} onChange={(e) => handleChange('location', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
            <div className="mb-4 flex">
              <label className="inline-block w-24 font-medium text-gray-700 dark:text-gray-300">Eqpt. Location</label>
              <div className="flex-1 border-b border-gray-300 dark:border-gray-600">
                <input type="text" value={formData.equipmentLocation || ''} onChange={(e) => handleChange('equipmentLocation', e.target.value)} readOnly={!isEditMode} className={`w-full bg-transparent border-none focus:ring-0 ${!isEditMode ? 'cursor-default' : ''}`}/>
            </div></div>
          </div>
        </div>
      </section>
      
      {/* Cable Information (acts as Nameplate for this report) */}
      <section className="mb-6 nameplate-section">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Cable & Termination Data</h2>
        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[ { label: "Tested From", field: "testedFrom", section: "cableInfo" }, { label: "", field: "", section: "" },
               { label: "Manufacturer", field: "manufacturer", section: "cableInfo" }, { label: "Cable Rated Voltage (kV)", field: "voltageRating", section: "cableInfo" },
               { label: "Cable Type", field: "cableType", section: null }, { label: "Length (ft)", field: "cableLength", section: null },
               { label: "Conductor Size", field: "size", section: "cableInfo" }, { label: "Insulation Type", field: "insulation", section: "cableInfo" },
               { label: "Conductor Material", field: "conductorMaterial", section: "cableInfo" }, { label: "Insulation Thickness", field: "insulationThickness", section: "cableInfo" },
               { label: "From", field: "from", section: "cableInfo" }, { label: "To", field: "to", section: "cableInfo" },
               { label: "Termination Data", field: "terminationData", section: "terminationData" }, { label: "Termination Data", field: "terminationData2", section: "terminationData" },
               { label: "Rated Voltage (kV)", field: "ratedVoltage", section: "terminationData" }, { label: "Rated Voltage (kV)", field: "ratedVoltage2", section: "terminationData" }
            ].map((item, idx) => (
              item.label ? (
              <div className="flex items-center" key={idx}>
                <label className="w-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</label>
                <input type="text" 
                       value={item.section ? formData[item.section]?.[item.field] || '' : formData[item.field] || ''}
                       onChange={(e) => item.section ? handleChange(item.section, {...formData[item.section], [item.field]: e.target.value}) : handleChange(item.field, e.target.value)}
                       readOnly={!isEditMode} 
                       className={`w-1/2 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
              </div>
              ) : <div key={idx}></div>
            ))}
          </div>
        </div>
      </section>

      {/* Visual and Mechanical Inspection */}
      <section className="mb-6 visual-mechanical-inspection">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">7.3.3.A Visual and Mechanical Inspection</h2>
        <div className="grid grid-cols-1 gap-4">
          {[ { label: "7.3.3.A.1 Compare cable data with drawings and specifications.", field: "inspectCablesAndConnectors" },
             { label: "7.3.3.A.2 Inspect exposed sections of cables for physical damage.", field: "inspectTerminationsAndSplices" },
             { label: "7.3.3.A.3.1 Use of a low-resistance ohmmeter in accordance with Section 7.3.3.B.1.", field: "useOhmmeter" },
             { label: "7.3.3.A.4 Inspect shield grounding, cable supports, and terminations.", field: "inspectShieldGrounding" },
             { label: "7.3.3.A.5 Verify that visible cable bends meet or exceed ICEA and manufacturer's minimum published bending radius.", field: "verifyBendRadius" },
             { label: "7.3.3.A.7 If cables are terminated through window-type current transformers, inspect to verify that neutral and ground conductors are correctly placed and that shields are correctly terminated for operation of protective devices.", field: "inspectCurrentTransformers" },
          ].map((item, idx) => (
            <div className="flex items-center" key={idx}>
              <label className="w-3/4 text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</label>
              <select value={formData.visualInspection[item.field] || InspectionResult.SELECT} 
                      onChange={(e) => handleChange('visualInspection', {...formData.visualInspection, [item.field]: e.target.value as InspectionResult})} 
                      disabled={!isEditMode} 
                      className="w-1/4 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white">
                {Object.values(InspectionResult).map((result) => (
                  <option key={result} value={result}>{result}</option>
                ))}
              </select>
            </div>
          ))}
          
          {/* Comments field for visual inspection */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Comments
            </label>
            <Textarea
              value={formData.visualInspection.comments}
              onChange={(e) => handleChange('visualInspection', {...formData.visualInspection, comments: e.target.value})}
              disabled={!isEditMode}
              className="w-full"
              rows={4}
              placeholder="Enter any additional comments or observations..."
            />
          </div>
        </div>
      </section>

      {/* Electrical Tests - Shield Continuity */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Shield Continuity</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
            <thead><tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">A Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">B Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">C Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Units</th>
            </tr></thead>
            <tbody><tr>
              {[ "phaseA", "phaseB", "phaseC" ].map(phase => (
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap" key={phase}>
                  <input type="text" value={formData.shieldContinuity[phase]} onChange={(e) => handleChange('shieldContinuity', {...formData.shieldContinuity, [phase]: e.target.value})} readOnly={!isEditMode} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
                </td>
              ))}
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap">
                  <select value={formData.shieldContinuity.unit} onChange={(e) => handleChange('shieldContinuity', {...formData.shieldContinuity, unit: e.target.value})} disabled={!isEditMode} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                    {continuityUnits.map(unit => (<option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>))}
                  </select>
                </td>
            </tr></tbody>
          </table>
        </div>
      </section>

      {/* Electrical Tests - Insulation Resistance Values */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Insulation Resistance Values</h2>
        <div className="mb-4 flex items-center">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Test Voltage:</label>
          <select value={formData.insulationTest.testVoltage} onChange={(e) => handleChange('insulationTest', {...formData.insulationTest, testVoltage: e.target.value})} disabled={!isEditMode} className={`w-32 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
            {insulationTestVoltages.map(option => (<option key={option.value} value={option.value} className="dark:bg-dark-100 dark:text-white">{option.label}</option>))}
          </select>
          <span className="ml-2 text-gray-900 dark:text-white">V</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
            <thead><tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"></th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={3}>Insulation Resistance</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={3}>Temperature Corrected</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Units</th>
            </tr><tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2"></th>
                {Array(2).fill(null).map((_, i) => ["A-G", "B-G", "C-G"].map(phase => <th key={`${i}-${phase}`} className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{phase}</th>))}
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2"></th>
            </tr></thead>
            <tbody>
            {[ {label: "Pre-Test", type: "preTest"}, {label: "Post-Test", type: "postTest"} ].map(test => (
              <tr key={test.type}>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{test.label}</td>
                {[ "ag", "bg", "cg" ].map(phase => (
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap" key={`${test.type}-${phase}-input`}>
                    <input type="text" value={formData.insulationTest[test.type][phase]} onChange={(e) => handleInsulationTestValueChange(test.type as 'preTest'|'postTest', phase, e.target.value)} readOnly={!isEditMode} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
                  </td>
                ))}
                {[ "ag", "bg", "cg" ].map(phase => (
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap" key={`${test.type}-${phase}-corrected`}>
                    <input type="text" value={formData.insulationTest[`${test.type}Corrected`][phase]} readOnly={true} className="w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm dark:bg-dark-100 dark:text-white bg-gray-100 dark:bg-dark-200"/>
                  </td>
                ))}
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{formData.insulationTest.unit}</td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-end items-center">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Units:</label>
          <select value={formData.insulationTest.unit} onChange={(e) => handleChange('insulationTest', {...formData.insulationTest, unit: e.target.value})} disabled={!isEditMode} className={`w-32 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
            {insulationUnits.map(unit => (<option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>))}
          </select>
        </div>
      </section>

      {/* Electrical Tests Withstand Test */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests Withstand Test</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
            <thead><tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time(min)</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">kVAC</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={2}>A Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={2}>B Phase</th>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" colSpan={2}>C Phase</th>
            </tr><tr>
                <th className="border border-gray-300 dark:border-gray-700 px-3 py-2"></th><th className="border border-gray-300 dark:border-gray-700 px-3 py-2"></th>
                {[ "phaseA", "phaseB", "phaseC" ].map(phase => (
                  <React.Fragment key={phase}>
                  <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <select onChange={(e) => { const newReadings = [...formData.withstandTest.readings]; newReadings.forEach(r => { r[phase].currentUnit = e.target.value; }); handleChange('withstandTest', { readings: newReadings });}}
                            value={formData.withstandTest.readings[0]?.[phase]?.currentUnit || 'mA'} disabled={!isEditMode}
                            className={`w-16 rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-xs dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                      {currentUnits.map(unit => (<option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>))}
                    </select>
                  </th>
                  <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">nF</th>
                  </React.Fragment>
                ))}
            </tr></thead>
            <tbody>
            {formData.withstandTest?.readings.map((reading, index) => (
              <tr key={index}>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap"><input type="text" value={reading.timeMinutes} onChange={(e) => handleWithstandTestChange(index, 'timeMinutes', e.target.value)} readOnly={!isEditMode} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/></td>
                <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap"><input type="text" value={reading.kVAC} onChange={(e) => handleWithstandTestChange(index, 'kVAC', e.target.value)} readOnly={!isEditMode} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/></td>
                {[ "phaseA", "phaseB", "phaseC" ].map(phase => (
                  <React.Fragment key={`${index}-${phase}`}>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap"><input type="text" value={reading[phase]?.mA || ''} onChange={(e) => handleWithstandTestChange(index, phase, e.target.value, phase, 'mA')} readOnly={!isEditMode} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/></td>
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2 whitespace-nowrap"><input type="text" value={reading[phase]?.nF || ''} onChange={(e) => handleWithstandTestChange(index, phase, e.target.value, phase, 'nF')} readOnly={!isEditMode} className={`w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/></td>
                  </React.Fragment>
                ))}
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
          {[ {label: "Ohmmeter", field: "ohmmeter"}, {label: "Serial Number", field: "ohmSerialNumber"}, {label: "AMP ID", field: "ampId"},
             {label: "Megohmmeter", field: "megohmmeter"}, {label: "Serial Number", field: "megohmSerialNumber"}, {label: "AMP ID", field: "ampId"},
             {label: "VLF Hipot", field: "vlfHipot"}, {label: "Serial Number", field: "vlfSerialNumber"}, {label: "AMP ID", field: "ampId"}
          ].map((item, idx) => (
            <div key={idx}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</label>
              <input type="text" value={formData.equipment?.[item.field] || ''} onChange={(e) => handleChange('equipment', {...formData.equipment, [item.field]: e.target.value})} readOnly={!isEditMode} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
            </div>
          ))}
        </div>
      </section>
      
      {/* Comments */}
      <section className="mb-6 comments-section">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
        <div>
          <textarea value={formData.comments || ''} onChange={(e) => handleChange('comments', e.target.value)} readOnly={!isEditMode} rows={4} className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''}`}/>
        </div>
      </section>
        </div>
      </div>
    </ReportWrapper>
  );
}

export default MediumVoltageVLFMTSReport;

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide number input arrows globally (screen + print) */
    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none !important;
      margin: 0 !important;
    }
    input[type="number"] {
      -moz-appearance: textfield !important;
    }

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
      
      /* Text inputs/selects/textarea styling (exclude checkboxes and radios) */
      input:not([type="checkbox"]):not([type="radio"]), select, textarea { 
        background-color: white !important; 
        border: 1px solid black !important; 
        color: black !important;
        padding: 2px !important; 
        font-size: 10px !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
      }

      /* Ensure checkboxes and radio buttons print with their native checked marks */
      input[type="checkbox"], input[type="radio"] {
        -webkit-appearance: auto !important;
        -moz-appearance: auto !important;
        appearance: auto !important;
        width: 12px !important;
        height: 12px !important;
        accent-color: #000 !important; /* ensure visible check mark in print */
        border: 1px solid black !important;
        background: white !important;
        vertical-align: middle !important;
        margin-right: 4px !important;
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
        appearance: textfield !important;
      }
      
      /* Hide interactive elements */
      button:not(.print-visible) { display: none !important; }
      
      /* Section styling */
      section { break-inside: avoid !important; margin-bottom: 20px !important; }
      
      /* Ensure all text is black for maximum readability */
      * { color: black !important; }

      /* Force printed layout to match on-screen for Job Information */
      .job-info-section .grid { display: grid !important; }
      .job-info-section .grid.grid-cols-1.md\:grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; gap: 4px !important; }
      /* Inline, compact rows (label left, input underlined) */
      .job-info-section .mb-4.flex { display: flex !important; align-items: center !important; margin-bottom: 8px !important; }
      .job-info-section label { width: 96px !important; font-size: 10px !important; margin-right: 6px !important; }
      .job-info-section .flex-1 { border-bottom: 1px solid black !important; }
      .job-info-section input { background: white !important; border: none !important; width: 100% !important; padding: 0 !important; height: 14px !important; font-size: 11px !important; }
      .job-info-section input[type="date"] { height: 16px !important; }
      .job-info-section .w-16 { width: 50px !important; }
      .job-info-section span { margin: 0 6px !important; }

      /* Nameplate/Cable & Termination Data alignment: label left, input right, 2-col rows */
      .nameplate-section .grid { display: grid !important; }
      .nameplate-section .grid.grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; }
      .nameplate-section .flex.items-center { display: flex !important; align-items: center !important; }
      .nameplate-section label { width: 50% !important; font-size: 10px !important; }
      .nameplate-section input, .nameplate-section select { width: 50% !important; background: white !important; border: 1px solid black !important; font-size: 11px !important; height: 16px !important; }
      .nameplate-section .dark\\:bg-dark-100 { background: white !important; }
      .nameplate-section .grid-cols-2 .gap-x-6 { column-gap: 16px !important; }
    }
  `;
  document.head.appendChild(style);
} 