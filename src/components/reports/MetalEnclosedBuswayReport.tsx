import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

// Add dropdown option constants
const INSPECTION_OPTIONS = [
  'Select One',
  'Satisfactory',
  'Unsatisfactory',
  'Cleaned',
  'See Comments',
  'Not Applicable'
];

const INSULATION_RESISTANCE_UNITS = [
  { value: 'kΩ', label: 'kΩ' },
  { value: 'MΩ', label: 'MΩ' },
  { value: 'GΩ', label: 'GΩ' }
];

const INSULATION_TEST_VOLTAGES = [
  '250V',
  '500V',
  '1000V',
  '2500V',
  '5000V'
];

const CONTACT_RESISTANCE_UNITS = [
  { value: 'μΩ', label: 'μΩ' },
  { value: 'mΩ', label: 'mΩ' },
  { value: 'Ω', label: 'Ω' }
];

const DIELECTRIC_WITHSTAND_UNITS = [
  { value: 'μA', label: 'μA' },
  { value: 'mA', label: 'mA' }
];

const VLF_WITHSTAND_TEST_VOLTAGES = [
  { rating: '5', voltage: '10' },
  { rating: '8', voltage: '13' },
  { rating: '15', voltage: '21' },
  { rating: '20', voltage: '26' },
  { rating: '25', voltage: '32' },
  { rating: '28', voltage: '36' },
  { rating: '30', voltage: '38' },
  { rating: '35', voltage: '44' },
  { rating: '46', voltage: '57' },
  { rating: '69', voltage: '84' }
];

const EQUIPMENT_EVALUATION_RESULTS = [
  'PASS',
  'FAIL',
  'LIMITED SERVICE'
];

interface FormData {
  // Customer information
  customer: string;
  address: string;
  user: string;
  date: string;
  identifier: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  equipment: string;
  
  // Temperature data
  temperature: string;
  fahrenheit: boolean;
  tcf: number;
  humidity: string;
  
  // Nameplate data
  manufacturer: string;
  catalogNumber: string;
  serialNumber: string;
  fedFrom: string;
  conductorMaterial: string;
  ratedVoltage: string;
  operatingVoltage: string;
  ampacity: string;
  
  // NETA section results
  netaResults: {
    [key: string]: string;
  };
  
  // Contact/Pole Resistance
  busResistance: {
    p1: string;
    p2: string;
    p3: string;
    neutral: string;
  };
  
  // Insulation Resistance
  testVoltage1: string;
  insulationResistance: {
    [key: string]: string;
  };
  correctedInsulationResistance: {
    [key: string]: string;
  };
  
  // Test Equipment
  megohmmeter: string;
  megohmSerial: string;
  megAmpId: string;
  lowResistanceOhmmeter: string;
  lowResistanceSerial: string;
  lowResistanceAmpId: string;
  
  comments: string;
  
  // Overall status
  status: 'PASS' | 'FAIL' | 'LIMITED SERVICE';
  
  // Add unit selection fields
  insulationResistanceUnit: string;
  contactResistanceUnit: string;
  dielectricWithstandUnit: string;
  
  // VLF withstand test fields
  cableRating: string;
  testVoltage: string;
  
  // Dielectric withstand test fields
  dielectricPhaseA: string;
  dielectricPhaseB: string;
  dielectricPhaseC: string;
}

// Add interface for the report data structure
interface ReportData {
  job_id: string;
  user_id: string;
  report_info: {
    customer: string;
    address: string;
    user: string;
    date: string;
    identifier: string;
    jobNumber: string;
    technicians: string;
    substation: string;
    equipment: string;
    
    temperature: string;
    fahrenheit: boolean;
    tcf: number;
    humidity: string;
    
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    fedFrom: string;
    conductorMaterial: string;
    ratedVoltage: string;
    operatingVoltage: string;
    ampacity: string;
    
    netaResults: { [key: string]: string };
    busResistance: {
      p1: string;
      p2: string;
      p3: string;
      neutral: string;
    };
    
    testVoltage1: string;
    insulationResistance: { [key: string]: string };
    
    insulationResistanceUnit: string;
    contactResistanceUnit: string;
    
    megohmmeter: string;
    megohmSerial: string;
    megAmpId: string;
    lowResistanceOhmmeter: string;
    lowResistanceSerial: string;
    lowResistanceAmpId: string;

    status: 'PASS' | 'FAIL' | 'LIMITED SERVICE';
  };
  comments: string;
  created_at?: string;
  updated_at: string;
}

// Add TCF conversion table
const TCF_TABLE = {
  '-24': 0.054,
  '-23': 0.068,
  '-22': 0.082,
  '-21': 0.096,
  '-20': 0.110,
  '-19': 0.124,
  '-18': 0.138,
  '-17': 0.152,
  '-16': 0.166,
  '-15': 0.180,
  '-14': 0.194,
  '-13': 0.208,
  '-12': 0.222,
  '-11': 0.236,
  '-10': 0.250,
  '-9': 0.264,
  '-8': 0.278,
  '-7': 0.292,
  '-6': 0.306,
  '-5': 0.320,
  '-4': 0.336,
  '-3': 0.352,
  '-2': 0.368,
  '-1': 0.384,
  '0': 0.400,
  '1': 0.420,
  '2': 0.440,
  '3': 0.460,
  '4': 0.480,
  '5': 0.500,
  '6': 0.526,
  '7': 0.552,
  '8': 0.578,
  '9': 0.604,
  '10': 0.630,
  '11': 0.666,
  '12': 0.702,
  '13': 0.738,
  '14': 0.774,
  '15': 0.810,
  '16': 0.848,
  '17': 0.886,
  '18': 0.924,
  '19': 0.962,
  '20': 1.000,
  '21': 1.050,
  '22': 1.100,
  '23': 1.150,
  '24': 1.200,
  '25': 1.250,
  '26': 1.316,
  '27': 1.382,
  '28': 1.448,
  '29': 1.514,
  '30': 1.580,
  '31': 1.664,
  '32': 1.748,
  '33': 1.832,
  '34': 1.872,
  '35': 2.000,
  '36': 2.100,
  '37': 2.200,
  '38': 2.300,
  '39': 2.400,
  '40': 2.500,
  '41': 2.628,
  '42': 2.756,
  '43': 2.884,
  '44': 3.012,
  '45': 3.150,
  '46': 3.316,
  '47': 3.482,
  '48': 3.648,
  '49': 3.814,
  '50': 3.980,
  '51': 4.184,
  '52': 4.388,
  '53': 4.592,
  '54': 4.796,
  '55': 5.000,
  '56': 5.260,
  '57': 5.520,
  '58': 5.780,
  '59': 6.040,
  '60': 6.300,
  '61': 6.620,
  '62': 6.940,
  '63': 7.260,
  '64': 7.580,
  '65': 7.900,
  '66': 8.320,
  '67': 8.740,
  '68': 9.160,
  '69': 9.580,
  '70': 10.000,
  '71': 10.520,
  '72': 11.040,
  '73': 11.560,
  '74': 12.080,
  '75': 12.600,
  '76': 13.240,
  '77': 13.880,
  '78': 14.520,
  '79': 15.160,
  '80': 15.800,
  '81': 16.640,
  '82': 17.480,
  '83': 18.320,
  '84': 19.160,
  '85': 20.000,
  '86': 21.040,
  '87': 22.080,
  '88': 23.120,
  '89': 24.160,
  '90': 25.200,
  '91': 26.450,
  '92': 27.700,
  '93': 28.950,
  '94': 30.200,
  '95': 31.600,
  '96': 33.280,
  '97': 34.960,
  '98': 36.640,
  '99': 38.320,
  '100': 40.000,
  '101': 42.080,
  '102': 44.160,
  '103': 46.240,
  '104': 48.320,
  '105': 50.400,
  '106': 52.960,
  '107': 55.520,
  '108': 58.080,
  '109': 60.640,
  '110': 63.200
} as const;

const MetalEnclosedBuswayReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  const [isSaving, setIsSaving] = useState(false);
  // Optional: hold raw row for debugging when ?debug=true
  const [rawRow, setRawRow] = useState<any>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [suggestedReports, setSuggestedReports] = useState<any[]>([]);
  
  // Print Mode Detection
  const isPrintMode = searchParams.get('print') === 'true';
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = 'metal-enclosed-busway'; // This component handles the metal-enclosed-busway route
  const reportName = getReportName(reportSlug);
  
  // Form state
  const [formData, setFormData] = useState<FormData>({
    // Customer information
    customer: '',
    address: '',
    user: '',
    date: '',
    identifier: '',
    jobNumber: '',
    technicians: '',
    substation: '',
    equipment: '',
    
    // Temperature data
    temperature: '',
    fahrenheit: true,
    tcf: 0.138,
    humidity: '',
    
    // Nameplate data
    manufacturer: '',
    catalogNumber: '',
    serialNumber: '',
    fedFrom: '',
    conductorMaterial: '',
    ratedVoltage: '',
    operatingVoltage: '',
    ampacity: '',
    
    // NETA section results
    netaResults: {
      '7.4.A.1': '',
      '7.4.A.2': '',
      '7.4.A.3': '',
      '7.4.A.4': '',
      '7.4.A.5.1': '',
      '7.4.A.6': '',
      '7.4.A.7': '',
      '7.4.A.8': '',
      '7.4.A.9': ''
    },
    
    // Contact/Pole Resistance
    busResistance: {
      p1: '',
      p2: '',
      p3: '',
      neutral: ''
    },
    
    // Insulation Resistance
    testVoltage1: '',
    insulationResistance: {
      'A-B': '',
      'B-C': '',
      'C-A': '',
      'A-N': '',
      'B-N': '',
      'C-N': '',
      'A-G': '',
      'B-G': '',
      'C-G': '',
      'N-G': ''
    },
    correctedInsulationResistance: {
      'A-B': '',
      'B-C': '',
      'C-A': '',
      'A-N': '',
      'B-N': '',
      'C-N': '',
      'A-G': '',
      'B-G': '',
      'C-G': '',
      'N-G': ''
    },
    
    // Test Equipment
    megohmmeter: '',
    megohmSerial: '',
    megAmpId: '',
    lowResistanceOhmmeter: '',
    lowResistanceSerial: '',
    lowResistanceAmpId: '',
    
    comments: '',
    
    // Overall status
    status: 'PASS',
    
    // Add unit selection fields
    insulationResistanceUnit: 'MΩ',
    contactResistanceUnit: 'μΩ',
    dielectricWithstandUnit: 'mA',
    
    // VLF withstand test fields
    cableRating: '',
    testVoltage: '',
    
    // Dielectric withstand test fields
    dielectricPhaseA: '',
    dielectricPhaseB: '',
    dielectricPhaseC: '',
  });
  
  // Temperature conversion functions
  const convertFtoC = (f: string): string => {
    const fValue = parseFloat(f);
    if (isNaN(fValue)) return '';
    return ((fValue - 32) * 5/9).toFixed(1);
  };
  
  // Update getTCF function to use the lookup table
  const getTCF = (temp: string): number => {
    const tempValue = parseFloat(temp);
    if (isNaN(tempValue)) return 0.138;
    
    // Convert Fahrenheit to Celsius
    const tempC = Math.round(parseFloat(convertFtoC(temp))).toString();
    
    // If temperature is below table minimum, return lowest value
    if (parseInt(tempC) < -24) return 0.054;
    
    // If temperature is above table maximum, return highest value
    if (parseInt(tempC) > 110) return 63.200;
    
    // Return exact value from table
    return TCF_TABLE[tempC as keyof typeof TCF_TABLE] || 0.138;
  };
  
  // Handle temperature change
  useEffect(() => {
    if (formData.temperature) {
      const tcf = getTCF(formData.temperature);
      setFormData(prev => ({...prev, tcf}));
    }
  }, [formData.temperature]);

  // Recalculate temperature-corrected insulation resistance values
  useEffect(() => {
    const keys = ['aToB','bToC','cToA','aToN','bToN','cToN','aToG','bToG','cToG','nToG'] as const;

    const parseReading = (value: string | number | undefined): number | null => {
      if (value === undefined || value === null) return null;
      const s = String(value).replace(/,/g, '').replace(/[^0-9eE+\-.]/g, '');
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };

    const tcf = Number(formData.tcf);
    if (!tcf || Number.isNaN(tcf)) {
      // Clear corrected values when TCF is invalid
      const cleared: Record<string, string> = {} as any;
      keys.forEach(k => { cleared[k] = ''; });
      const changed = keys.some(k => (formData.correctedInsulationResistance[k] || '') !== (cleared[k] || ''));
      if (changed) {
        setFormData(prev => ({ ...prev, correctedInsulationResistance: cleared }));
      }
      return;
    }

    const computed: Record<string, string> = {} as any;
    keys.forEach(k => {
      const base = parseReading((formData.insulationResistance as any)[k]);
      computed[k] = base === null ? '' : (base * tcf).toFixed(2);
    });

    const changed = keys.some(k => (formData.correctedInsulationResistance[k] || '') !== (computed[k] || ''));
    if (changed) {
      setFormData(prev => ({ ...prev, correctedInsulationResistance: computed }));
    }
  }, [formData.insulationResistance, formData.tcf]);
  
  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  // Handle NETA section results
  const handleNetaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      netaResults: {
        ...formData.netaResults,
        [name]: value
      }
    });
  };
  
  // Handle bus resistance changes
  const handleBusResistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      busResistance: {
        ...formData.busResistance,
        [name]: value
      }
    });
  };
  
  // Handle insulation resistance changes
  const handleInsulationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const key = getDataKey(name);
    setFormData({
      ...formData,
      insulationResistance: {
        ...formData.insulationResistance,
        [key]: value
      }
    });
  };
  
  // Toggle pass/fail status
  const toggleStatus = () => {
    setFormData({
      ...formData,
      status: formData.status === 'PASS' ? 'FAIL' : 'PASS'
    });
  };

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;

    try {
      setLoading(true);
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

      if (jobData) {
        // Then fetch customer data
        let customerName = '';
        let customerAddress = '';
        
        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select(`
              name,
              address
            `)
            .eq('id', jobData.customer_id)
            .single();

          if (!customerError && customerData) {
            customerName = customerData.name;
            customerAddress = customerData.address;
          }
        }

        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: customerName,
          address: customerAddress
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
    } finally {
      setLoading(false);
    }
  };

  // Add key mapping function to convert between display keys and data keys
  const getDataKey = (displayKey: string): string => {
    const keyMap: { [key: string]: string } = {
      'A-B': 'aToB',
      'B-C': 'bToC',
      'C-A': 'cToA',
      'A-N': 'aToN',
      'B-N': 'bToN',
      'C-N': 'cToN',
      'A-G': 'aToG',
      'B-G': 'bToG',
      'C-G': 'cToG',
      'N-G': 'nToG'
    };
    return keyMap[displayKey] || displayKey;
  };

  // Load report data
  const loadReport = async () => {
    // Load report without requiring user context; viewing does not need user id
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      // Primary fetch: by id only
      let { data, error } = await supabase
        .schema('neta_ops')
        .from('metal_enclosed_busway_reports')
        .select('*, report_info, visual_mechanical, visual_mechanical_inspection, contact_resistance, bus_resistance, insulation_resistance, test_equipment, comments, status')
        .eq('id', reportId)
        .maybeSingle();

      if (error || !data) {
        // Fallback: some RLS policies require matching user_id and/or job_id
        console.warn('Primary fetch returned no row. Trying fallback filters (user_id/job_id)...');
        const fb = supabase
          .schema('neta_ops')
          .from('metal_enclosed_busway_reports')
          .select('*, report_info, visual_mechanical, visual_mechanical_inspection, contact_resistance, bus_resistance, insulation_resistance, test_equipment, comments, status')
          .eq('id', reportId)
          .eq('job_id', jobId || '')
          .maybeSingle();
        let fbResult = await fb;
        if ((!fbResult.data || fbResult.error) && user?.id) {
          fbResult = await supabase
            .schema('neta_ops')
            .from('metal_enclosed_busway_reports')
            .select('*, report_info, visual_mechanical, visual_mechanical_inspection, contact_resistance, bus_resistance, insulation_resistance, test_equipment, comments, status')
            .eq('id', reportId)
            .eq('user_id', user.id)
            .maybeSingle();
        }
        data = fbResult.data as any;
        error = fbResult.error as any;
      }

      if (error && !data) {
        console.warn(`Report with ID ${reportId} not found or access denied.`, error);
        setNotFound(true);
        // Try to suggest existing reports for this job so user can pick one
        if (jobId) {
          const { data: list } = await supabase
            .schema('neta_ops')
            .from('metal_enclosed_busway_reports')
            .select('id, created_at')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .limit(10);
          setSuggestedReports(list || []);
        }
        return;
      }

      if (data) {
        setRawRow(data);
        console.log('🔍 MetalEnclosedBuswayReport - Loaded data:', data);
        console.log('🔍 insulation_resistance column:', data.insulation_resistance);
        console.log('🔍 insulation_resistance.readings:', data.insulation_resistance?.readings);
        console.log('🔍 insulation_resistance.correctedReadings:', data.insulation_resistance?.correctedReadings);
        console.log('🔍 insulation_resistance.readings.aToB:', data.insulation_resistance?.readings?.aToB);
        console.log('🔍 insulation_resistance.correctedReadings.aToB:', data.insulation_resistance?.correctedReadings?.aToB);
        
        // Map the data from separate columns to the formData structure
        // Build helpers to normalize from multiple shapes
        const normalizeInsulationObj = (src: any): Record<string,string> => {
          if (!src || typeof src !== 'object') return {};
          // Accept both display keys and aToB keys
          const out: Record<string,string> = {};
          const fromDisplay = (k: string) => ({
            'A-B':'aToB','B-C':'bToC','C-A':'cToA','A-N':'aToN','B-N':'bToN','C-N':'cToN','A-G':'aToG','B-G':'bToG','C-G':'cToG','N-G':'nToG'
          } as any)[k] || k;
          Object.keys(src).forEach(k => {
            const key = fromDisplay(k);
            out[key] = src[k];
          });
          return out;
        };

        const expectedIds = [
          '7.4.A.1','7.4.A.2','7.4.A.3','7.4.A.4','7.4.A.5.1','7.4.A.6','7.4.A.7','7.4.A.8','7.4.A.9'
        ];
        const guessIdFromDescription = (desc: string): string | null => {
          const d = (desc || '').toLowerCase();
          if (!d) return null;
          if (d.includes('nameplate') && d.includes('drawings')) return '7.4.A.1';
          if (d.includes('inspect') && d.includes('mechanical')) return '7.4.A.2';
          if (d.includes('anchorage') || (d.includes('alignment') && d.includes('ground'))) return '7.4.A.3';
          if (d.includes('single-line') || (d.includes('single line') && d.includes('diagram'))) return '7.4.A.4';
          if (d.includes('low-resistance') || d.includes('ohmmeter')) return '7.4.A.5.1';
          if (d.includes('orientation') || d.includes('adequate cooling')) return '7.4.A.6';
          if (d.includes('weep-hole') || d.includes('weep hole')) return '7.4.A.7';
          if (d.includes('joint') && d.includes('shield')) return '7.4.A.8';
          if (d.includes('ventilating') || d.includes('openings')) return '7.4.A.9';
          return null;
        };
        const vmiFromArray = (arr: any[]): Record<string,string> => {
          const base: Record<string,string> = Object.fromEntries(expectedIds.map(id => [id, '']));
          (arr || []).forEach((item: any) => {
            if (!item) return;
            const value = item.result ?? item.value ?? '';
            let key = item.id ?? item.section ?? null;
            if (!key && item.description) key = guessIdFromDescription(item.description);
            if (key && expectedIds.includes(key) && value !== undefined) {
              base[key] = value;
            }
          });
          return base;
        };

        // Payload fallback (for tables where everything is under a JSONB column like report_data or data)
        const payload: any = (data as any).report_data || (data as any).data || {};

        const R = (key: string, def: any = '') => (data.report_info?.[key] ?? payload.report_info?.[key] ?? payload[key] ?? def);
        const J = (key: string) => (data as any)[key] ?? payload[key];

        // Prefer new column names but fall back to legacy ones; prefer NON-EMPTY values
        const isNonEmptyArray = (a: any) => Array.isArray(a) && a.length > 0;
        const isNonEmptyObj = (o: any) => o && typeof o === 'object' && Object.keys(o).length > 0;

        const vmInspect = J('visual_mechanical_inspection');
        const vmLegacy = J('visual_mechanical');
        const visualArray = isNonEmptyArray(vmInspect)
          ? vmInspect
          : (isNonEmptyArray(vmLegacy) ? vmLegacy : []);

        const busNew = J('bus_resistance');
        const busLegacy = J('contact_resistance');
        const busResObj = isNonEmptyObj(busNew) ? busNew : (isNonEmptyObj(busLegacy) ? busLegacy : (R('busResistance', {}) || {}));

        const newFormData = {
          customer: R('customer'),
          address: R('address'),
          user: R('user'),
          date: R('date'),
          identifier: R('identifier'),
          jobNumber: R('jobNumber'),
          technicians: R('technicians'),
          substation: R('substation'),
          // Importer stores equipment location as 'eqptLocation'; support both
          equipment: (R('equipment') || (data.report_info?.eqptLocation ?? (payload.report_info?.eqptLocation ?? payload.eqptLocation) ?? '')),
          
          temperature: R('temperature'),
          fahrenheit: (data.report_info?.fahrenheit ?? payload.report_info?.fahrenheit ?? true),
          tcf: (data.insulation_resistance?.tcf ? parseFloat(data.insulation_resistance.tcf)
                : (typeof R('tcf') === 'number' ? R('tcf') : 0.138)),
          humidity: R('humidity'),
          
          manufacturer: R('manufacturer'),
          catalogNumber: R('catalogNumber'),
          serialNumber: R('serialNumber'),
          fedFrom: R('fedFrom'),
          conductorMaterial: R('conductorMaterial'),
          ratedVoltage: R('ratedVoltage'),
          operatingVoltage: R('operatingVoltage'),
          ampacity: R('ampacity'),
          
          // Visual and mechanical inspection from separate column(s) or report_info
          netaResults: (Array.isArray(visualArray)
            ? vmiFromArray(visualArray)
            : ({
                '7.4.A.1': R('netaResults', {})['7.4.A.1'] || '',
                '7.4.A.2': R('netaResults', {})['7.4.A.2'] || '',
                '7.4.A.3': R('netaResults', {})['7.4.A.3'] || '',
                '7.4.A.4': R('netaResults', {})['7.4.A.4'] || '',
                '7.4.A.5.1': R('netaResults', {})['7.4.A.5.1'] || '',
                '7.4.A.6': R('netaResults', {})['7.4.A.6'] || '',
                '7.4.A.7': R('netaResults', {})['7.4.A.7'] || '',
                '7.4.A.8': R('netaResults', {})['7.4.A.8'] || '',
                '7.4.A.9': R('netaResults', {})['7.4.A.9'] || ''
              })),
          
          // Bus resistance from separate column or report_info
          busResistance: {
            p1: busResObj?.p1 ?? busResObj?.P1 ?? busResObj?.phase1 ?? '',
            p2: busResObj?.p2 ?? busResObj?.P2 ?? busResObj?.phase2 ?? '',
            p3: busResObj?.p3 ?? busResObj?.P3 ?? busResObj?.phase3 ?? '',
            neutral: busResObj?.neutral ?? busResObj?.N ?? busResObj?.neut ?? ''
          },
          
          // Map insulation resistance from the separate column
          testVoltage1: J('insulation_resistance')?.testVoltage || R('testVoltage1') || '',
          insulationResistance: {
            ...(J('insulation_resistance')?.readings
              ? {
                  aToB: J('insulation_resistance').readings.aToB || '',
                  bToC: J('insulation_resistance').readings.bToC || '',
                  cToA: J('insulation_resistance').readings.cToA || '',
                  aToN: J('insulation_resistance').readings.aToN || '',
                  bToN: J('insulation_resistance').readings.bToN || '',
                  cToN: J('insulation_resistance').readings.cToN || '',
                  aToG: J('insulation_resistance').readings.aToG || '',
                  bToG: J('insulation_resistance').readings.bToG || '',
                  cToG: J('insulation_resistance').readings.cToG || '',
                  nToG: J('insulation_resistance').readings.nToG || ''
                }
              : normalizeInsulationObj(R('insulationResistance', {}))),
          },
          correctedInsulationResistance: {
            aToB: J('insulation_resistance')?.correctedReadings?.aToB || '',
            bToC: J('insulation_resistance')?.correctedReadings?.bToC || '',
            cToA: J('insulation_resistance')?.correctedReadings?.cToA || '',
            aToN: J('insulation_resistance')?.correctedReadings?.aToN || '',
            bToN: J('insulation_resistance')?.correctedReadings?.bToN || '',
            cToN: J('insulation_resistance')?.correctedReadings?.cToN || '',
            aToG: J('insulation_resistance')?.correctedReadings?.aToG || '',
            bToG: J('insulation_resistance')?.correctedReadings?.bToG || '',
            cToG: J('insulation_resistance')?.correctedReadings?.cToG || '',
            nToG: J('insulation_resistance')?.correctedReadings?.nToG || ''
          },
          
          // Map test equipment from the separate column
          megohmmeter: J('test_equipment')?.megohmmeter?.name || R('megohmmeter') || '',
          megohmSerial: J('test_equipment')?.megohmmeter?.serialNumber || R('megohmSerial') || '',
          megAmpId: J('test_equipment')?.megohmmeter?.ampId || R('megAmpId') || '',
          lowResistanceOhmmeter: J('test_equipment')?.lowResistanceOhmmeter?.name || R('lowResistanceOhmmeter') || '',
          lowResistanceSerial: J('test_equipment')?.lowResistanceOhmmeter?.serialNumber || R('lowResistanceSerial') || '',
          lowResistanceAmpId: J('test_equipment')?.lowResistanceOhmmeter?.ampId || R('lowResistanceAmpId') || '',
          
          comments: data.comments || '',
          status: data.status || 'PASS',
          
          insulationResistanceUnit: J('insulation_resistance')?.units || R('insulationResistanceUnit') || 'MΩ',
          contactResistanceUnit: 'μΩ', // Default value
          dielectricWithstandUnit: 'mA', // Default value
          
          cableRating: '', // Not used in this report
          testVoltage: J('insulation_resistance')?.testVoltage || R('testVoltage1') || '',
          
          dielectricPhaseA: '', // Not used in this report
          dielectricPhaseB: '', // Not used in this report
          dielectricPhaseC: '', // Not used in this report
        };
        
        console.log('🔍 MetalEnclosedBuswayReport - Mapped formData:', newFormData);
        setFormData(newFormData);
        setIsEditing(false);
      } else {
        console.warn('MetalEnclosedBuswayReport - No data returned for id:', reportId);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert('Error loading report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Save report
  const handleSave = async () => {
    if (!jobId || !user?.id) {
      console.error('Missing required job ID or user ID');
      alert('Error: Missing required information. Please try again.');
      return;
    }

    try {
      setIsSaving(true);
      setIsEditing(false); // Disable editing while saving
      
      const reportData: ReportData = {
        job_id: jobId,
        user_id: user.id,
        report_info: {
          customer: formData.customer,
          address: formData.address,
          user: formData.user,
          date: formData.date,
          identifier: formData.identifier,
          jobNumber: formData.jobNumber,
          technicians: formData.technicians,
          substation: formData.substation,
          equipment: formData.equipment,
          
          temperature: formData.temperature,
          fahrenheit: formData.fahrenheit,
          tcf: formData.tcf,
          humidity: formData.humidity,
          
          manufacturer: formData.manufacturer,
          catalogNumber: formData.catalogNumber,
          serialNumber: formData.serialNumber,
          fedFrom: formData.fedFrom,
          conductorMaterial: formData.conductorMaterial,
          ratedVoltage: formData.ratedVoltage,
          operatingVoltage: formData.operatingVoltage,
          ampacity: formData.ampacity,
          
          netaResults: formData.netaResults,
          busResistance: formData.busResistance,
          
          testVoltage1: formData.testVoltage1,
          insulationResistance: formData.insulationResistance,
          
          insulationResistanceUnit: formData.insulationResistanceUnit,
          contactResistanceUnit: formData.contactResistanceUnit,
          
          megohmmeter: formData.megohmmeter,
          megohmSerial: formData.megohmSerial,
          megAmpId: formData.megAmpId,
          lowResistanceOhmmeter: formData.lowResistanceOhmmeter,
          lowResistanceSerial: formData.lowResistanceSerial,
          lowResistanceAmpId: formData.lowResistanceAmpId,

          status: formData.status
        },
        comments: formData.comments,
        updated_at: new Date().toISOString()
      };

      // Also populate dedicated JSONB columns for robust loads
      const visualArray = Object.entries(formData.netaResults || {}).map(([id, result]) => ({ id, result }));
      const busRes = {
        p1: formData.busResistance?.p1 || '',
        p2: formData.busResistance?.p2 || '',
        p3: formData.busResistance?.p3 || '',
        neutral: formData.busResistance?.neutral || ''
      };
      const insRes = {
        testVoltage: formData.testVoltage1 || '',
        units: formData.insulationResistanceUnit || 'MΩ',
        temperature: formData.temperature || '',
        tcf: formData.tcf,
        readings: {
          aToB: formData.insulationResistance.aToB || '',
          bToC: formData.insulationResistance.bToC || '',
          cToA: formData.insulationResistance.cToA || '',
          aToN: formData.insulationResistance.aToN || '',
          bToN: formData.insulationResistance.bToN || '',
          cToN: formData.insulationResistance.cToN || '',
          aToG: formData.insulationResistance.aToG || '',
          bToG: formData.insulationResistance.bToG || '',
          cToG: formData.insulationResistance.cToG || '',
          nToG: formData.insulationResistance.nToG || ''
        },
        correctedReadings: {
          aToB: formData.correctedInsulationResistance.aToB || '',
          bToC: formData.correctedInsulationResistance.bToC || '',
          cToA: formData.correctedInsulationResistance.cToA || '',
          aToN: formData.correctedInsulationResistance.aToN || '',
          bToN: formData.correctedInsulationResistance.bToN || '',
          cToN: formData.correctedInsulationResistance.cToN || '',
          aToG: formData.correctedInsulationResistance.aToG || '',
          bToG: formData.correctedInsulationResistance.bToG || '',
          cToG: formData.correctedInsulationResistance.cToG || '',
          nToG: formData.correctedInsulationResistance.nToG || ''
        }
      };
      const testEquipment = {
        megohmmeter: {
          name: formData.megohmmeter || '',
          serialNumber: formData.megohmSerial || '',
          ampId: formData.megAmpId || ''
        },
        lowResistanceOhmmeter: {
          name: formData.lowResistanceOhmmeter || '',
          serialNumber: formData.lowResistanceSerial || '',
          ampId: formData.lowResistanceAmpId || ''
        }
      };

      const upsertPayload: any = {
        report_info: reportData.report_info,
        comments: reportData.comments,
        status: reportData.report_info.status,
        visual_mechanical_inspection: visualArray,
        bus_resistance: busRes,
        insulation_resistance: insRes,
        test_equipment: testEquipment
      };

      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from('metal_enclosed_busway_reports')
          .update(upsertPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Insert new report
        reportData.created_at = new Date().toISOString();
        result = await supabase
          .schema('neta_ops')
          .from('metal_enclosed_busway_reports')
          .insert({
            job_id: jobId,
            user_id: user.id,
            ...upsertPayload,
            created_at: reportData.created_at,
            updated_at: reportData.updated_at
          })
          .select()
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      // If this was a new report, create and link an asset
      if (!reportId && result.data) {
        // Create asset entry
        const assetData = {
          name: getAssetName(reportSlug, formData.identifier || formData.equipment || ''),
          file_url: `report:/jobs/${jobId}/metal-enclosed-busway/${result.data.id}`,
          user_id: user.id
        };

        const { data: assetResult, error: assetError } = await supabase
          .schema('neta_ops')
          .from('assets')
          .insert(assetData)
          .select('id')
          .single();

        if (assetError) throw assetError;

        // Link asset to job
        const { error: linkError } = await supabase
          .schema('neta_ops')
          .from('job_assets')
          .insert({
            job_id: jobId,
            asset_id: assetResult.id,
            user_id: user.id
          });

        if (linkError) throw linkError;

        // Navigate back to job assets to see the newly created report
        navigateAfterSave(navigate, jobId, location);
      }

      setIsEditing(false); // Exit editing mode
      alert('Report saved successfully!');
      navigateAfterSave(navigate, jobId, location);
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Error saving report. Please try again.');
      setIsEditing(true); // Re-enable editing if save failed
    } finally {
      setIsSaving(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, reportId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (notFound) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Report not found or access denied</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">We couldn’t load this Metal Enclosed Busway report. It may not exist, or you may not have permission.</p>
        {jobId && suggestedReports.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-gray-900 dark:text-white">Recent reports for this job:</h3>
            <ul className="list-disc pl-5 text-sm text-blue-600 dark:text-blue-300">
              {suggestedReports.map(r => (
                <li key={r.id}>
                  <a href={`/jobs/${jobId}/metal-enclosed-busway/${r.id}`} className="underline">
                    {r.id}
                  </a>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
            if (isEditing) {
              setFormData(prev => ({
                ...prev,
                status: prev.status === 'PASS' ? 'FAIL' : prev.status === 'FAIL' ? 'LIMITED SERVICE' : 'PASS'
              }));
            }
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            formData.status === 'PASS'
              ? 'bg-green-600 text-white focus:ring-green-500 hover:bg-green-700'
              : formData.status === 'FAIL'
              ? 'bg-red-600 text-white focus:ring-red-500 hover:bg-red-700'
              : 'bg-yellow-500 text-black focus:ring-yellow-400 hover:bg-yellow-600'
          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : ''}`}
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
            disabled={!isEditing || isSaving}
            className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90 disabled:opacity-50'}`}
          >
            {isSaving ? 'Saving...' : reportId ? 'Update Report' : 'Save Report'}
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
          NETA - ATS 7.4
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
          {/* Optional debug dump: open with ?debug=true */}
          {searchParams.get('debug') === 'true' && (
            <section className="mb-4">
              <h2 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">Debug: Raw Loaded Row</h2>
              <pre className="p-3 bg-gray-100 dark:bg-dark-100 rounded text-xs overflow-auto max-h-64 text-gray-900 dark:text-white">
                {rawRow ? JSON.stringify(rawRow, null, 2) : 'No row loaded'}
              </pre>
            </section>
          )}
          {/* Header with title and buttons */}
          <div className={`${isPrintMode ? 'hidden' : ''} print:hidden`}>
            {renderHeader()}
          </div>

      {/* Job Information */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Job Information</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Job #</label>
              <input
                type="text"
                name="jobNumber"
                value={formData.jobNumber}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer</label>
              <input
                type="text"
                name="customer"
                value={formData.customer}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                readOnly={!isEditing}
                rows={3}
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-dark-100 text-gray-900 dark:text-white text-sm resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Identifier</label>
              <input
                type="text"
                name="identifier"
                value={formData.identifier}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Technicians</label>
              <input
                type="text"
                name="technicians"
                value={formData.technicians}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Substation</label>
              <input
                type="text"
                name="substation"
                value={formData.substation}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Equipment Location</label>
              <input
                type="text"
                name="equipment"
                value={formData.equipment}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
              <input
                type="text"
                name="user"
                value={formData.user}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white text-sm focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Temp.</label>
                <input
                  type="number"
                  name="temperature"
                  value={formData.temperature}
                  onChange={handleInputChange}
                  readOnly={!isEditing}
                  className={`w-12 px-1 py-1 text-right border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white text-xs focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">°F</span>
              </div>

              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={formData.temperature ? convertFtoC(formData.temperature) : ''}
                  readOnly
                  className="w-10 px-1 py-1 text-right border border-gray-300 dark:border-gray-700 rounded bg-gray-50 dark:bg-dark-100 text-gray-900 dark:text-white text-xs"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">°C</span>
              </div>

              <div className="flex items-center space-x-1">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">TCF</label>
                <input
                  type="text"
                  value={formData.tcf.toFixed(3)}
                  readOnly
                  className="w-10 px-1 py-1 text-right border border-gray-300 dark:border-gray-700 rounded bg-gray-50 dark:bg-dark-100 text-gray-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  name="humidity"
                  value={formData.humidity}
                  onChange={handleInputChange}
                  readOnly={!isEditing}
                  className={`w-12 px-1 py-1 text-right border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white text-xs focus:border-[#f26722] focus:ring-1 focus:ring-[#f26722] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : 'bg-white dark:bg-dark-100'}`}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Nameplate Data */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Nameplate Data</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer</label>
              <input
                type="text"
                name="manufacturer"
                value={formData.manufacturer}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog Number</label>
              <input
                type="text"
                name="catalogNumber"
                value={formData.catalogNumber}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
              <input
                type="text"
                name="serialNumber"
                value={formData.serialNumber}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fed From</label>
              <input
                type="text"
                name="fedFrom"
                value={formData.fedFrom}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Conductor Material</label>
              <input
                type="text"
                name="conductorMaterial"
                value={formData.conductorMaterial}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rated Voltage (kV)</label>
              <input
                type="text"
                name="ratedVoltage"
                value={formData.ratedVoltage}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Voltage (kV)</label>
              <input
                type="text"
                name="operatingVoltage"
                value={formData.operatingVoltage}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ampacity (A)</label>
              <input
                type="text"
                name="ampacity"
                value={formData.ampacity}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
          </div>
        </div>
      </section>
      
      {/* Visual and Mechanical Inspection */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Visual and Mechanical Inspection</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-6 py-3 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 bg-gray-50 dark:bg-dark-200 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Result</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              {Object.entries(formData.netaResults).map(([id, result]) => (
                <tr key={id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{id}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    {(() => {
                      switch(id) {
                        case '7.4.A.1': return 'Compare equipment nameplate data with drawings and specifications.';
                        case '7.4.A.2': return 'Inspect physical and mechanical condition.';
                        case '7.4.A.3': return 'Inspect anchorage, alignment, and grounding.';
                        case '7.4.A.4': return 'Verify correct connection in accordance with single-line diagram.';
                        case '7.4.A.5.1': return 'Use of a low-resistance ohmmeter in accordance with Section 7.4.B.';
                        case '7.4.A.6': return 'Confirm physical orientation in accordance with manufacturer\'s labels to insure adequate cooling.';
                        case '7.4.A.7': return 'Verify "weep-hole" plugs are in accordance with manufacturer\'s published data.';
                        case '7.4.A.8': return 'Verify correct installation of joint shield.';
                        case '7.4.A.9': return 'Verify ventilating openings are clean.';
                        default: return '';
                      }
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      name={id}
                      value={result}
                      onChange={handleNetaChange}
                      disabled={!isEditing}
                      className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    >
                      {INSPECTION_OPTIONS.map(option => (
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
      
      {/* Electrical Tests - Contact/Pole Resistance */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Contact/Pole Resistance</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th colSpan={5} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Bus Resistance</th>
              </tr>
              <tr>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">P1</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">P2</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">P3</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Neutral</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Units</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    name="p1"
                    value={formData.busResistance.p1}
                    onChange={handleBusResistanceChange}
                    readOnly={!isEditing}
                    className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    name="p2"
                    value={formData.busResistance.p2}
                    onChange={handleBusResistanceChange}
                    readOnly={!isEditing}
                    className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    name="p3"
                    value={formData.busResistance.p3}
                    onChange={handleBusResistanceChange}
                    readOnly={!isEditing}
                    className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    name="neutral"
                    value={formData.busResistance.neutral}
                    onChange={handleBusResistanceChange}
                    readOnly={!isEditing}
                    className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </td>
                <td className="px-3 py-2 text-center text-sm text-gray-900 dark:text-white">
                  {formData.contactResistanceUnit}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      
      {/* Electrical Tests - Insulation Resistance */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Insulation Resistance</h2>
        <div className="flex justify-end mb-2 space-x-4">
          <div className="w-48 border border-gray-300 dark:border-gray-700 p-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Test Voltage:</label>
            <select
              name="testVoltage1"
              value={formData.testVoltage1}
              onChange={handleInputChange}
              disabled={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            >
              <option value="">Select Voltage</option>
              {INSULATION_TEST_VOLTAGES.map(voltage => (
                <option key={voltage} value={voltage}>{voltage}</option>
              ))}
            </select>
          </div>
          <div className="w-48 border border-gray-300 dark:border-gray-700 p-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Unit:</label>
            <select
              name="insulationResistanceUnit"
              value={formData.insulationResistanceUnit}
              onChange={handleInputChange}
              disabled={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            >
              {INSULATION_RESISTANCE_UNITS.map(unit => (
                <option key={unit.value} value={unit.value}>{unit.label}</option>
              ))}
            </select>
          </div>
        </div>
        

        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th colSpan={10} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Insulation Resistance</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
              </tr>
              <tr>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">A-B</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">B-C</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">C-A</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">A-N</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">B-N</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">C-N</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">A-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">B-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">C-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">N-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                {['A-B', 'B-C', 'C-A', 'A-N', 'B-N', 'C-N', 'A-G', 'B-G', 'C-G', 'N-G'].map((key) => (
                  <td key={key} className="px-3 py-2">
                    <input
                      type="text"
                      name={key}
                      value={formData.insulationResistance[getDataKey(key)]}
                      onChange={handleInsulationChange}
                      readOnly={!isEditing}
                      className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-center text-sm text-gray-900 dark:text-white">
                  {formData.insulationResistanceUnit}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      
      {/* Electrical Tests - Temperature Corrected Insulation Resistance Values */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Electrical Tests - Temperature Corrected Insulation Resistance Values</h2>
        <div className="flex justify-end mb-2">
          <div className="w-48 border border-gray-300 dark:border-gray-700 p-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Test Voltage:</label>
            <input
              type="text"
              value={formData.testVoltage1}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white"
            />
          </div>
        </div>
        
        {/* Temperature and TCF Information - CORRECTED VALUES SECTION */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temperature (°F):</label>
            <input
              type="text"
              value={formData.temperature || ''}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temperature (°C):</label>
            <input
              type="text"
              value={formData.temperature ? ((parseFloat(formData.temperature) - 32) * 5/9).toFixed(1) : ''}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">TCF:</label>
            <input
              type="text"
              value={formData.tcf ? formData.tcf.toFixed(3) : ''}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th colSpan={10} className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Temperature Corrected Values</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
              </tr>
              <tr>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">A-B</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">B-C</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">C-A</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">A-N</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">B-N</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">C-N</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">A-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">B-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">C-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">N-G</th>
                <th className="px-3 py-2 bg-gray-50 dark:bg-dark-200 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                {['A-B', 'B-C', 'C-A', 'A-N', 'B-N', 'C-N', 'A-G', 'B-G', 'C-G', 'N-G'].map((key) => (
                  <td key={key} className="px-3 py-2">
                    <input
                      type="text"
                      value={formData.correctedInsulationResistance[getDataKey(key)] || ''}
                      readOnly
                      className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm text-sm dark:text-white"
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-center text-sm text-gray-900 dark:text-white">
                  {formData.insulationResistanceUnit}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      
      {/* Test Equipment Used */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Test Equipment Used</h2>
        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Megohmmeter</label>
              <input
                type="text"
                name="megohmmeter"
                value={formData.megohmmeter}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
              <input
                type="text"
                name="megohmSerial"
                value={formData.megohmSerial}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label>
              <input
                type="text"
                name="megAmpId"
                value={formData.megAmpId}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Low Resistance Ohmmeter</label>
              <input
                type="text"
                name="lowResistanceOhmmeter"
                value={formData.lowResistanceOhmmeter}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
              <input
                type="text"
                name="lowResistanceSerial"
                value={formData.lowResistanceSerial}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label>
              <input
                type="text"
                name="lowResistanceAmpId"
                value={formData.lowResistanceAmpId}
                onChange={handleInputChange}
                readOnly={!isEditing}
                className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
          </div>
        </div>
      </section>
      
      {/* Comments */}
      <section className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold">Comments</h2>
        <textarea
          name="comments"
          value={formData.comments}
          onChange={handleInputChange}
          readOnly={!isEditing}
          rows={4}
          className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-100 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
        />
      </section>
        </div>
      </div>
    </ReportWrapper>
  );
};

// Add this function to calculate temperature-corrected insulation resistance values
const calculateTempCorrectedValue = (value: string, tcf: number): string => {
  if (!value || !tcf) return '';
  return (parseFloat(value) * parseFloat(tcf.toFixed(3))).toFixed(2);
};

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
      
      /* Ensure all text is black for maximum readability */
      * { color: black !important; }
      
      /* Table input sizing for print */
      table input, table select, table textarea {
        width: 80% !important;
        max-width: 80% !important;
        min-width: 30px !important;
        font-size: 7px !important;
        padding: 0px !important;
        border: 1px solid black !important;
        background-color: white !important;
        color: black !important;
        box-sizing: border-box !important;
        margin: 0px !important;
      }
      
      /* Specific table column sizing */
      table th, table td {
        padding: 1px !important;
        font-size: 7px !important;
        width: 8% !important;
        min-width: 40px !important;
        max-width: 8% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      
      /* Ensure tables don't break across pages */
      table { 
        page-break-inside: avoid !important; 
        border-collapse: collapse !important;
        width: 100% !important;
        table-layout: fixed !important;
      }
      
      /* Force table columns to be more compact */
      table th:first-child,
      table td:first-child {
        width: 8% !important;
        max-width: 8% !important;
      }
      
      table th:last-child,
      table td:last-child {
        width: 8% !important;
        max-width: 8% !important;
      }
      
      /* Additional table constraints */
      table * {
        box-sizing: border-box !important;
      }
      
      /* Prevent any overflow */
      table, table th, table td, table input, table select, table textarea {
        overflow: hidden !important;
        word-wrap: break-word !important;
      }
      
      /* Section styling */
      section { break-inside: avoid !important; margin-bottom: 20px !important; }
    }
  `;
  document.head.appendChild(style);
}

export default MetalEnclosedBuswayReport;