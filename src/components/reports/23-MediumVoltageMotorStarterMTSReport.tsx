import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import _ from 'lodash';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';

// Temperature conversion and correction factor lookup tables (reuse from other reports)
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

// Dropdown options
const visualInspectionResultOptions = [
  "Select One", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"
];
const insulationResistanceUnitOptions = [
  { symbol: "kΩ", name: "Kilo-Ohms" }, { symbol: "MΩ", name: "Mega-Ohms" }, { symbol: "GΩ", name: "Giga-Ohms" }
];
const contactResistanceUnitOptions = [
  { symbol: "µΩ", name: "Micro-Ohms" }, { symbol: "mΩ", name: "Milli-Ohms" }, { symbol: "Ω", name: "Ohms" }
];

const insulationTestVoltageOptions = ["250V", "500V", "1000V", "2500V", "5000V"]; // Add more if needed based on common practice

interface FormData {
  // Job Information
  customerName: string;
  customerAddress: string;
  userName: string;
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
  status: 'PASS' | 'FAIL';

  // Nameplate Data
  nameplateData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    type: string;
    manufacturingDate: string;
    icRating: string; // I.C. Rating (kA)
    ratedVoltageKV: string;
    operatingVoltageKV: string;
    ampacity: string;
    impulseRatingBIL: string;
  };

  // Visual and Mechanical Inspection
  visualMechanicalInspection: {
    items: Array<{
      netaSection: string;
      description: string;
      result: string;
    }>;
    eGap: {
      unitMeasurement: string;
      tolerance: string;
      aPhase: string;
      bPhase: string;
      cPhase: string;
    };
  };

  // Fuse Data
  fuseData: {
    manufacturer: string;
    catalogNumber: string;
    class: string;
    ratedVoltageKV: string;
    ampacity: string;
    icRatingKA: string;
  };

  // Electrical Tests
  electricalTests: {
    contactResistanceAsFound: Array<{
      test: string; // Switch, Fuse, Switch + Fuse
      p1: string;
      p2: string;
      p3: string;
      units: string;
    }>;
    contactResistanceAsLeft: Array<{
      test: string; // Switch, Fuse, Switch + Fuse
      p1: string;
      p2: string;
      p3: string;
      units: string;
    }>;
    insulationResistance: {
      testVoltage: string;
      readings: Array<{
        test: string; // Pole to Pole, Pole to Frame, Line to Load
        state: string; // Closed, Open
        p1_mq: string;
        p2_mq: string;
        p3_mq: string;
      }>;
    };
    temperatureCorrected: {
      testVoltage: string; // Should likely be same as insulationResistance.testVoltage
      readings: Array<{
        test: string;
        state: string;
        p1_mq: string;
        p2_mq: string;
        p3_mq: string;
      }>;
    };
  };

  // Contactor Data
  contactorData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    type: string;
    manufacturingDate: string;
    icRatingKA: string;
    ratedVoltageKV: string;
    operatingVoltageKV: string;
    ampacity: string;
    controlVoltageV: string;
  };

  // Electrical Test - Contactor
  electricalTestContactor: {
    insulationResistance: {
      testVoltage: string;
      readings: Array<{
        test: string;
        state: string;
        p1_mq: string;
        p2_mq: string;
        p3_mq: string;
      }>;
    };
    temperatureCorrected: {
      testVoltage: string;
      readings: Array<{
        test: string;
        state: string;
        p1_mq: string;
        p2_mq: string;
        p3_mq: string;
      }>;
    };
    vacuumBottleIntegrity: {
      testVoltage: string;
      testDuration: string; // "1 Min."
      p1: string;
      p2: string;
      p3: string;
      units: string;
    };
  };

  // Starting Reactor Data
  startingReactorData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    ratedCurrentA: string;
    ratedVoltageKV: string;
    operatingVoltageKV: string;
  };

  // Electrical Test - Reactor
  electricalTestReactor: {
    insulationResistance: {
      testVoltage: string;
      windingToGround: {
        aPhase: string;
        bPhase: string;
        cPhase: string;
        units: string;
      };
    };
    temperatureCorrected: {
      testVoltage: string;
      windingToGround: {
        aPhase: string;
        bPhase: string;
        cPhase: string;
        units: string;
      };
    };
    contactResistanceAsFound: { // Assuming one table for now
      aPhase: string;
      bPhase: string;
      cPhase: string;
      units: string;
    };
    contactResistanceAsLeft: { // Added As Left
      aPhase: string;
      bPhase: string;
      cPhase: string;
      units: string;
    };
  };

  // Test Equipment Used
  testEquipmentUsed: {
    megohmmeter: { name: string; serialNumber: string; ampId: string; };
    lowResistanceOhmmeter: { name: string; serialNumber: string; ampId: string; };
    hipot: { name: string; serialNumber: string; ampId: string; };
  };

  comments: string;
}

const initialVisualMechanicalItems = [
  { netaSection: '7.16.1.2.A.1', description: 'Inspect physical and mechanical condition.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.2', description: 'Inspect anchorage, alignment, and grounding.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.4', description: 'Clean the unit.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.5.1', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.16.1.2.B.1.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.6', description: 'Test electrical and mechanical interlock systems for correct operation and sequencing.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.7', description: 'Verify correct barrier and shutter installation and operation.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.8', description: 'Exercise active components and confirm correct operation of indicating devices.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.9', description: "Inspect contactors. 1. Verify mechanical operation. 2. Inspect and adjust contact gap, wipe, alignment, and pressure in accordance with manufacturer's published data.", result: 'Select One' },
  { netaSection: '7.16.1.2.A.10', description: 'Compare overload protection rating with motor nameplate to verify correct size. Set adjustable or programmable devices according to the protective device coordination study.', result: 'Select One' },
  { netaSection: '7.16.1.2.A.11', description: 'Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: 'Select One' },
];

const MediumVoltageMotorStarterMTSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = '23-medium-voltage-motor-starter-mts-report'; // This component handles the 23-medium-voltage-motor-starter-mts-report route
  const reportName = getReportName(reportSlug); // Edit if no reportId

  const initialFormData: FormData = {
    customerName: '',
    customerAddress: '',
    userName: '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 68, celsius: 20, tcf: 1, humidity: 0 },
    substation: '',
    eqptLocation: '',
    status: 'PASS',
    nameplateData: {
      manufacturer: '', catalogNumber: '', serialNumber: '', type: '', manufacturingDate: '',
      icRating: '', ratedVoltageKV: '', operatingVoltageKV: '', ampacity: '', impulseRatingBIL: ''
    },
    visualMechanicalInspection: {
      items: _.cloneDeep(initialVisualMechanicalItems),
      eGap: {
        unitMeasurement: '',
        tolerance: '',
        aPhase: '',
        bPhase: '',
        cPhase: ''
      }
    },
    fuseData: {
      manufacturer: '', catalogNumber: '', class: '', ratedVoltageKV: '', ampacity: '', icRatingKA: ''
    },
    electricalTests: {
      contactResistanceAsFound: [
        { test: 'Switch', p1: '', p2: '', p3: '', units: 'µΩ' },
        { test: 'Fuse', p1: '', p2: '', p3: '', units: 'µΩ' },
        { test: 'Switch + Fuse', p1: '', p2: '', p3: '', units: 'µΩ' },
      ],
      contactResistanceAsLeft: [
        { test: 'Switch', p1: '', p2: '', p3: '', units: 'µΩ' },
        { test: 'Fuse', p1: '', p2: '', p3: '', units: 'µΩ' },
        { test: 'Switch + Fuse', p1: '', p2: '', p3: '', units: 'µΩ' },
      ],
      insulationResistance: {
        testVoltage: '1000V',
        readings: [
          { test: 'Pole to Pole', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Pole to Frame', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Line to Load', state: 'Open', p1_mq: '', p2_mq: '', p3_mq: '' },
        ]
      },
      temperatureCorrected: {
        testVoltage: '1000V', // Should match above
        readings: [
          { test: 'Pole to Pole', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Pole to Frame', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Line to Load', state: 'Open', p1_mq: '', p2_mq: '', p3_mq: '' },
        ]
      }
    },
    contactorData: {
      manufacturer: '', catalogNumber: '', serialNumber: '', type: '', manufacturingDate: '',
      icRatingKA: '', ratedVoltageKV: '', operatingVoltageKV: '', ampacity: '', controlVoltageV: ''
    },
    electricalTestContactor: {
      insulationResistance: {
        testVoltage: '1000V',
        readings: [
          { test: 'Pole to Pole', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Pole to Frame', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Line to Load', state: 'Open', p1_mq: '', p2_mq: '', p3_mq: '' },
        ]
      },
      temperatureCorrected: {
        testVoltage: '1000V',
        readings: [
          { test: 'Pole to Pole', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Pole to Frame', state: 'Closed', p1_mq: '', p2_mq: '', p3_mq: '' },
          { test: 'Line to Load', state: 'Open', p1_mq: '', p2_mq: '', p3_mq: '' },
        ]
      },
      vacuumBottleIntegrity: {
        testVoltage: '', testDuration: '1 Min.', p1: '', p2: '', p3: '', units: ''
      }
    },
    startingReactorData: {
      manufacturer: '', catalogNumber: '', serialNumber: '',
      ratedCurrentA: '', ratedVoltageKV: '', operatingVoltageKV: ''
    },
    electricalTestReactor: {
      insulationResistance: {
        testVoltage: '1000V',
        windingToGround: { aPhase: '', bPhase: '', cPhase: '', units: 'MΩ' }
      },
      temperatureCorrected: {
        testVoltage: '1000V',
        windingToGround: { aPhase: '', bPhase: '', cPhase: '', units: 'MΩ' }
      },
      contactResistanceAsFound: {
        aPhase: '', bPhase: '', cPhase: '', units: 'µΩ'
      },
      contactResistanceAsLeft: {
        aPhase: '', bPhase: '', cPhase: '', units: 'µΩ'
      }
    },
    testEquipmentUsed: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
      hipot: { name: '', serialNumber: '', ampId: '' }
    },
    comments: ''
  };

  const [formData, setFormData] = useState<FormData>(initialFormData);

  // Print Mode Detection
  const [searchParams] = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';

  const loadJobInfo = async () => {
    if (!jobId) return;
    try {
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('title, job_number, customer_id')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;

      if (jobData?.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .schema('common')
          .from('customers')
          .select('name, company_name, address')
          .eq('id', jobData.customer_id)
          .single();
        if (!customerError && customerData) {
          setFormData(prev => ({
            ...prev,
            customerName: customerData.company_name || customerData.name || '',
            customerAddress: customerData.address || '',
            jobNumber: jobData.job_number || ''
          }));
        }
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      alert(`Failed to load job info: ${(error as Error).message}`);
    }
  };

  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('medium_voltage_motor_starter_mts_reports') // Ensure this table name is correct
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Resource not found
          console.warn(`Report with ID ${reportId} not found. Starting new report.`);
          setIsEditing(true);
          setFormData(initialFormData); // Reset to initial if not found
        } else {
          throw error;
        }
      }
      
      if (data && data.report_data) {
         // Deep merge to preserve structure, especially for nested arrays/objects
        setFormData(prev => _.merge({}, prev, data.report_data));
        setIsEditing(false);
      } else if (!data && !error) { // Data is null but no error, means not found
        setIsEditing(true);
        setFormData(initialFormData);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true); // Fallback to edit mode on error
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [jobId, reportId, user]); // Added user to dependencies if initialFormData relies on it

  useEffect(() => {
    // Reset editing state and form data when reportId changes (e.g. navigating from new to existing or vice-versa)
    setIsEditing(!reportId);
    if (!reportId) {
        // If it's a new report, reset specific fields that shouldn't carry over from a previous view
        const freshInitialData = _.cloneDeep(initialFormData);
        freshInitialData.userName = ''; // Don't auto-fill user email
        // Preserve job-related info if already loaded
        freshInitialData.customerName = formData.customerName;
        freshInitialData.customerAddress = formData.customerAddress;
        freshInitialData.jobNumber = formData.jobNumber;
        setFormData(freshInitialData);
    }
  }, [reportId, user]);


  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: formData
    };

    try {
      let result;
      const reportTableName = 'medium_voltage_motor_starter_mts_reports'; // Define table name

      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from(reportTableName)
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from(reportTableName)
          .insert(reportPayload)
          .select()
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/23-medium-voltage-motor-starter-mts-report/${result.data.id}`, // Match new route
            user_id: user.id,
            template_type: 'MTS' // Or specific type
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
            .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });
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
    const celsius = Math.round((fahrenheit - 32) * 5 / 9);
    const tcf = getTCF(celsius);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit, celsius, tcf } }));
  };

  const handleCelsiusChange = (celsius: number) => {
    const fahrenheit = Math.round(celsius * 9 / 5 + 32);
    const tcf = getTCF(celsius);
    setFormData(prev => ({ ...prev, temperature: { ...prev.temperature, fahrenheit, celsius, tcf } }));
  };

  const handleChange = (path: string, value: any) => {
    setFormData(prev => _.set(_.cloneDeep(prev), path, value));
  };
  
  const handleListChange = (listPath: string, index: number, field: string, value: any) => {
    setFormData(prev => {
      const newList = _.cloneDeep(_.get(prev, listPath));
      if (newList && newList[index]) {
        newList[index][field] = value;
        return _.set(_.cloneDeep(prev), listPath, newList);
      }
      return prev;
    });
  };


  // Calculate temperature corrected values for simple MOhms readings
  const calculateCorrectedMOhm = (valueStr: string): string => {
    if (!valueStr || valueStr.match(/[><a-zA-Z]/)) return valueStr; // Handle special strings like ">1000", "N/A"
    const value = parseFloat(valueStr);
    if (isNaN(value)) return valueStr;
    return (value * formData.temperature.tcf).toFixed(2);
  };
  
  useEffect(() => {
    // Auto-update temperature corrected insulation resistance values
    const newElectricalTests = _.cloneDeep(formData.electricalTests);
    newElectricalTests.temperatureCorrected.readings.forEach((reading, index) => {
      const originalReading = formData.electricalTests.insulationResistance.readings[index];
      reading.p1_mq = calculateCorrectedMOhm(originalReading.p1_mq);
      reading.p2_mq = calculateCorrectedMOhm(originalReading.p2_mq);
      reading.p3_mq = calculateCorrectedMOhm(originalReading.p3_mq);
    });
    // Sync test voltage
    newElectricalTests.temperatureCorrected.testVoltage = formData.electricalTests.insulationResistance.testVoltage;


    const newElectricalTestContactor = _.cloneDeep(formData.electricalTestContactor);
    newElectricalTestContactor.temperatureCorrected.readings.forEach((reading, index) => {
        const originalReading = formData.electricalTestContactor.insulationResistance.readings[index];
        reading.p1_mq = calculateCorrectedMOhm(originalReading.p1_mq);
        reading.p2_mq = calculateCorrectedMOhm(originalReading.p2_mq);
        reading.p3_mq = calculateCorrectedMOhm(originalReading.p3_mq);
    });
    newElectricalTestContactor.temperatureCorrected.testVoltage = formData.electricalTestContactor.insulationResistance.testVoltage;

    const newElectricalTestReactor = _.cloneDeep(formData.electricalTestReactor);
    const originalReactorInsulation = formData.electricalTestReactor.insulationResistance.windingToGround;
    newElectricalTestReactor.temperatureCorrected.windingToGround.aPhase = calculateCorrectedMOhm(originalReactorInsulation.aPhase);
    newElectricalTestReactor.temperatureCorrected.windingToGround.bPhase = calculateCorrectedMOhm(originalReactorInsulation.bPhase);
    newElectricalTestReactor.temperatureCorrected.windingToGround.cPhase = calculateCorrectedMOhm(originalReactorInsulation.cPhase);
    newElectricalTestReactor.temperatureCorrected.windingToGround.units = originalReactorInsulation.units; // Keep units same
    newElectricalTestReactor.temperatureCorrected.testVoltage = formData.electricalTestReactor.insulationResistance.testVoltage;


    if (!_.isEqual(newElectricalTests, formData.electricalTests) || 
        !_.isEqual(newElectricalTestContactor, formData.electricalTestContactor) ||
        !_.isEqual(newElectricalTestReactor, formData.electricalTestReactor)
    ) {
      setFormData(prev => ({
        ...prev,
        electricalTests: newElectricalTests,
        electricalTestContactor: newElectricalTestContactor,
        electricalTestReactor: newElectricalTestReactor,
      }));
    }
  }, [
      formData.temperature.tcf, 
      formData.electricalTests.insulationResistance,
      formData.electricalTestContactor.insulationResistance,
      formData.electricalTestReactor.insulationResistance,
  ]);



  if (loading) return <div className="p-4 text-center text-gray-700 dark:text-gray-300">Loading report data...</div>;

  // Render method (JSX to be added in subsequent steps)
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
      
      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
          {/* Header: Title and Buttons */}
          <div className="print:hidden flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isEditing) handleChange('status', formData.status === 'PASS' ? 'FAIL' : 'PASS')
                }}
                disabled={!isEditing}
                className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' : 'bg-red-600 text-white focus:ring-red-500'
                } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
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
                  className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${(!isEditing || loading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-orange-700'}`}>
                  {loading ? 'Saving...' : (reportId ? 'Update Report' : 'Save Report')}
                </button>
              )}
            </div>
          </div>

          {/* Job Information Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-job-info">Job Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Left Column */}
              <div className="space-y-3">
                <div>
                  <label className="form-label inline-block w-32">Customer:</label>
                  <input type="text" value={formData.customerName} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-[calc(100%-8rem)]" />
                </div>
                <div>
                  <label className="form-label inline-block w-32">Address:</label>
                  <input type="text" value={formData.customerAddress} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-[calc(100%-8rem)]" />
                </div>
                 <div>
                  <label htmlFor="user" className="form-label inline-block w-32">User:</label>
                  <input id="user" name="user" type="text" value={formData.userName} onChange={(e) => handleChange('userName', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-8rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div>
                  <label htmlFor="date" className="form-label inline-block w-32">Date:</label>
                  <input id="date" name="date" type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-8rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div>
                  <label htmlFor="identifier" className="form-label inline-block w-32">Identifier:</label>
                  <input id="identifier" name="identifier" type="text" value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-8rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
              </div>
              {/* Right Column */}
              <div className="space-y-3">
                <div>
                  <label className="form-label inline-block w-32">Job #:</label>
                  <input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-[calc(100%-8rem)]" />
                </div>
                <div>
                  <label htmlFor="technicians" className="form-label inline-block w-32">Technicians:</label>
                  <input id="technicians" name="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-8rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div className="flex items-center">
                  <label htmlFor="temperature.fahrenheit" className="form-label inline-block w-16">Temp:</label>
                  <input id="temperature.fahrenheit" name="temperature.fahrenheit" type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="mx-1">°F</span>
                  <input id="temperature.celsius" name="temperature.celsius" type="number" value={formData.temperature.celsius} onChange={(e) => handleCelsiusChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="mx-1">°C</span>
                  <label htmlFor="temperature.tcf" className="form-label inline-block w-10 ml-2">TCF:</label>
                  <input id="temperature.tcf" name="temperature.tcf" type="number" value={formData.temperature.tcf} readOnly className="form-input w-20 bg-gray-100 dark:bg-dark-200" />
                </div>
                <div>
                  <label htmlFor="temperature.humidity" className="form-label inline-block w-32">Humidity:</label>
                  <input id="temperature.humidity" name="temperature.humidity" type="number" value={formData.temperature.humidity} onChange={(e) => handleChange('temperature.humidity', Number(e.target.value))} readOnly={!isEditing} className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="ml-1">%</span>
                </div>
                <div>
                  <label htmlFor="substation" className="form-label inline-block w-32">Substation:</label>
                  <input id="substation" name="substation" type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-8rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
                <div>
                  <label htmlFor="eqptLocation" className="form-label inline-block w-32">Eqpt. Location:</label>
                  <input id="eqptLocation" name="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-8rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                </div>
              </div>
            </div>
          </div>
          
          {/* Nameplate Data Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-nameplate-data">Nameplate Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Left Column */}
              <div className="space-y-3">
                <div><label htmlFor="nameplateData.manufacturer" className="form-label inline-block w-40">Manufacturer:</label><input id="nameplateData.manufacturer" type="text" value={formData.nameplateData.manufacturer} onChange={(e) => handleChange('nameplateData.manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.catalogNumber" className="form-label inline-block w-40">Catalog Number:</label><input id="nameplateData.catalogNumber" type="text" value={formData.nameplateData.catalogNumber} onChange={(e) => handleChange('nameplateData.catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.serialNumber" className="form-label inline-block w-40">Serial Number:</label><input id="nameplateData.serialNumber" type="text" value={formData.nameplateData.serialNumber} onChange={(e) => handleChange('nameplateData.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.type" className="form-label inline-block w-40">Type:</label><input id="nameplateData.type" type="text" value={formData.nameplateData.type} onChange={(e) => handleChange('nameplateData.type', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.manufacturingDate" className="form-label inline-block w-40">Manufacturing Date:</label><input id="nameplateData.manufacturingDate" type="text" value={formData.nameplateData.manufacturingDate} onChange={(e) => handleChange('nameplateData.manufacturingDate', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              </div>
              {/* Right Column */}
              <div className="space-y-3">
                <div><label htmlFor="nameplateData.icRating" className="form-label inline-block w-40">I.C. Rating (kA):</label><input id="nameplateData.icRating" type="text" value={formData.nameplateData.icRating} onChange={(e) => handleChange('nameplateData.icRating', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.ratedVoltageKV" className="form-label inline-block w-40">Rated Voltage (kV):</label><input id="nameplateData.ratedVoltageKV" type="text" value={formData.nameplateData.ratedVoltageKV} onChange={(e) => handleChange('nameplateData.ratedVoltageKV', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.operatingVoltageKV" className="form-label inline-block w-40">Operating Voltage (kV):</label><input id="nameplateData.operatingVoltageKV" type="text" value={formData.nameplateData.operatingVoltageKV} onChange={(e) => handleChange('nameplateData.operatingVoltageKV', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.ampacity" className="form-label inline-block w-40">Ampacity:</label><input id="nameplateData.ampacity" type="text" value={formData.nameplateData.ampacity} onChange={(e) => handleChange('nameplateData.ampacity', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="nameplateData.impulseRatingBIL" className="form-label inline-block w-40">Impulse Rating (BIL):</label><input id="nameplateData.impulseRatingBIL" type="text" value={formData.nameplateData.impulseRatingBIL} onChange={(e) => handleChange('nameplateData.impulseRatingBIL', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              </div>
            </div>
          </div>

          {/* Visual and Mechanical Inspection Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-visual-mechanical">Visual and Mechanical Inspection</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/4">NETA Section</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/2">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/4">Results</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {formData.visualMechanicalInspection.items.map((item, index) => (
                    <tr key={item.netaSection}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">{item.netaSection}</td>
                      <td className="px-6 py-4 text-sm">{item.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select 
                          value={item.result} 
                          onChange={(e) => handleListChange('visualMechanicalInspection.items', index, 'result', e.target.value)} 
                          disabled={!isEditing} 
                          className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        >
                          {visualInspectionResultOptions.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <h3 className="text-md font-semibold mb-2 text-gray-900 dark:text-white">E-Gap</h3>
              {/* Applying styling from MediumVoltageCircuitBreakerMTSReport.tsx */}
              <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 w-1/6">E-Gap</th> {/* Adjusted width */}
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 w-1/6">Unit Measurement</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 w-1/6">Tolerance</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 w-1/6">A-Phase</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 w-1/6">B-Phase</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 w-1/6">C-Phase</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"></td> {/* Empty cell for alignment below E-Gap header */}
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <input type="text" value={formData.visualMechanicalInspection.eGap.unitMeasurement} onChange={(e) => handleChange('visualMechanicalInspection.eGap.unitMeasurement', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <input type="text" value={formData.visualMechanicalInspection.eGap.tolerance} onChange={(e) => handleChange('visualMechanicalInspection.eGap.tolerance', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <input type="text" value={formData.visualMechanicalInspection.eGap.aPhase} onChange={(e) => handleChange('visualMechanicalInspection.eGap.aPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <input type="text" value={formData.visualMechanicalInspection.eGap.bPhase} onChange={(e) => handleChange('visualMechanicalInspection.eGap.bPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                      <input type="text" value={formData.visualMechanicalInspection.eGap.cPhase} onChange={(e) => handleChange('visualMechanicalInspection.eGap.cPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Fuse Data Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-fuse-data">Fuse Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div><label htmlFor="fuseData.manufacturer" className="form-label block">Manufacturer:</label><input id="fuseData.manufacturer" type="text" value={formData.fuseData.manufacturer} onChange={(e) => handleChange('fuseData.manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="fuseData.catalogNumber" className="form-label block">Catalog Number:</label><input id="fuseData.catalogNumber" type="text" value={formData.fuseData.catalogNumber} onChange={(e) => handleChange('fuseData.catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="fuseData.class" className="form-label block">Class:</label><input id="fuseData.class" type="text" value={formData.fuseData.class} onChange={(e) => handleChange('fuseData.class', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="fuseData.ratedVoltageKV" className="form-label block">Rated Voltage (kV):</label><input id="fuseData.ratedVoltageKV" type="text" value={formData.fuseData.ratedVoltageKV} onChange={(e) => handleChange('fuseData.ratedVoltageKV', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="fuseData.ampacity" className="form-label block">Ampacity (A):</label><input id="fuseData.ampacity" type="text" value={formData.fuseData.ampacity} onChange={(e) => handleChange('fuseData.ampacity', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
              <div><label htmlFor="fuseData.icRatingKA" className="form-label block">I.C. Rating (kA):</label><input id="fuseData.icRatingKA" type="text" value={formData.fuseData.icRatingKA} onChange={(e) => handleChange('fuseData.icRatingKA', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            </div>
          </div>

          {/* Electrical Tests Section (General) */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-electrical-tests">Electrical Tests</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Resistance (As Found) */}
              <div>
                <h3 className="text-md font-semibold mb-2">Contact Resistance (As Found)</h3>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-dark-200">
                      <th className="p-2 border dark:border-gray-600"></th>
                      <th className="p-2 border dark:border-gray-600">P1</th>
                      <th className="p-2 border dark:border-gray-600">P2</th>
                      <th className="p-2 border dark:border-gray-600">P3</th>
                      <th className="p-2 border dark:border-gray-600">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.electricalTests.contactResistanceAsFound.map((row, index) => (
                      <tr key={`cr-found-${index}`}>
                        <td className="p-2 border dark:border-gray-600 font-medium">{row.test}</td>
                        {(['p1', 'p2', 'p3'] as const).map(phase => (
                           <td key={phase} className="p-1 border dark:border-gray-600"><input type="text" value={row[phase]} onChange={(e) => handleListChange('electricalTests.contactResistanceAsFound', index, phase, e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                        ))}
                        <td className="p-1 border dark:border-gray-600">
                          <select value={row.units} onChange={(e) => handleListChange('electricalTests.contactResistanceAsFound', index, 'units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                            {contactResistanceUnitOptions.map(opt => <option key={opt.symbol} value={opt.symbol}>{opt.symbol}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Contact Resistance (As Left) */}
              <div>
                <h3 className="text-md font-semibold mb-2">Contact Resistance (As Left)</h3>
                 <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-dark-200">
                      <th className="p-2 border dark:border-gray-600"></th>
                      <th className="p-2 border dark:border-gray-600">P1</th>
                      <th className="p-2 border dark:border-gray-600">P2</th>
                      <th className="p-2 border dark:border-gray-600">P3</th>
                      <th className="p-2 border dark:border-gray-600">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.electricalTests.contactResistanceAsLeft.map((row, index) => (
                      <tr key={`cr-left-${index}`}>
                        <td className="p-2 border dark:border-gray-600 font-medium">{row.test}</td>
                         {(['p1', 'p2', 'p3'] as const).map(phase => (
                           <td key={phase} className="p-1 border dark:border-gray-600"><input type="text" value={row[phase]} onChange={(e) => handleListChange('electricalTests.contactResistanceAsLeft', index, phase, e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                        ))}
                        <td className="p-1 border dark:border-gray-600">
                          <select value={row.units} onChange={(e) => handleListChange('electricalTests.contactResistanceAsLeft', index, 'units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                            {contactResistanceUnitOptions.map(opt => <option key={opt.symbol} value={opt.symbol}>{opt.symbol}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* Insulation Resistance */}
              <div>
                <h3 className="text-md font-semibold mb-2">Insulation Resistance</h3>
                <div className="mb-2">
                  <label className="form-label mr-2">Test Voltage:</label>
                  <select value={formData.electricalTests.insulationResistance.testVoltage} onChange={(e) => handleChange('electricalTests.insulationResistance.testVoltage', e.target.value)} disabled={!isEditing} className={`form-select inline-block w-auto ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                    {insulationTestVoltageOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-dark-200">
                      <th className="p-2 border dark:border-gray-600">Test Voltage</th>
                      <th className="p-2 border dark:border-gray-600"></th>
                      <th className="p-2 border dark:border-gray-600">P1 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P2 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P3 MΩ Reading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.electricalTests.insulationResistance.readings.map((row, index) => (
                      <tr key={`ir-${index}`}>
                        <td className="p-2 border dark:border-gray-600 font-medium">{row.test}</td>
                        <td className="p-2 border dark:border-gray-600 text-center">{row.state}</td>
                        {(['p1_mq', 'p2_mq', 'p3_mq'] as const).map(phase => (
                           <td key={phase} className="p-1 border dark:border-gray-600"><input type="text" value={row[phase]} onChange={(e) => handleListChange('electricalTests.insulationResistance.readings', index, phase, e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Temperature Corrected Insulation Resistance */}
              <div>
                <h3 className="text-md font-semibold mb-2">Temperature Corrected</h3>
                 <div className="mb-2">
                  <label className="form-label mr-2">Test Voltage:</label>
                  <input type="text" value={formData.electricalTests.temperatureCorrected.testVoltage} readOnly className="form-input inline-block w-auto bg-gray-100 dark:bg-dark-200" />
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-dark-200">
                      <th className="p-2 border dark:border-gray-600">Test Voltage</th>
                      <th className="p-2 border dark:border-gray-600"></th>
                      <th className="p-2 border dark:border-gray-600">P1 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P2 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P3 MΩ Reading</th>
                    </tr>
                  </thead>
                  <tbody>
                     {formData.electricalTests.temperatureCorrected.readings.map((row, index) => (
                      <tr key={`tc-ir-${index}`}>
                        <td className="p-2 border dark:border-gray-600 font-medium">{row.test}</td>
                        <td className="p-2 border dark:border-gray-600 text-center">{row.state}</td>
                         {(['p1_mq', 'p2_mq', 'p3_mq'] as const).map(phase => (
                           <td key={phase} className="p-1 border dark:border-gray-600"><input type="text" value={row[phase]} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Contactor Data Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-contactor-data">Contactor Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {/* Left Column */}
                <div className="space-y-3">
                    <div><label htmlFor="contactorData.manufacturer" className="form-label inline-block w-40">Manufacturer:</label><input id="contactorData.manufacturer" type="text" value={formData.contactorData.manufacturer} onChange={(e) => handleChange('contactorData.manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.catalogNumber" className="form-label inline-block w-40">Catalog Number:</label><input id="contactorData.catalogNumber" type="text" value={formData.contactorData.catalogNumber} onChange={(e) => handleChange('contactorData.catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.serialNumber" className="form-label inline-block w-40">Serial Number:</label><input id="contactorData.serialNumber" type="text" value={formData.contactorData.serialNumber} onChange={(e) => handleChange('contactorData.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.type" className="form-label inline-block w-40">Type:</label><input id="contactorData.type" type="text" value={formData.contactorData.type} onChange={(e) => handleChange('contactorData.type', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.manufacturingDate" className="form-label inline-block w-40">Manufacturing Date:</label><input id="contactorData.manufacturingDate" type="text" value={formData.contactorData.manufacturingDate} onChange={(e) => handleChange('contactorData.manufacturingDate', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                </div>
                {/* Right Column */}
                <div className="space-y-3">
                    <div><label htmlFor="contactorData.icRatingKA" className="form-label inline-block w-40">I.C. Rating (kA):</label><input id="contactorData.icRatingKA" type="text" value={formData.contactorData.icRatingKA} onChange={(e) => handleChange('contactorData.icRatingKA', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.ratedVoltageKV" className="form-label inline-block w-40">Rated Voltage (kV):</label><input id="contactorData.ratedVoltageKV" type="text" value={formData.contactorData.ratedVoltageKV} onChange={(e) => handleChange('contactorData.ratedVoltageKV', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.operatingVoltageKV" className="form-label inline-block w-40">Operating Voltage (kV):</label><input id="contactorData.operatingVoltageKV" type="text" value={formData.contactorData.operatingVoltageKV} onChange={(e) => handleChange('contactorData.operatingVoltageKV', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.ampacity" className="form-label inline-block w-40">Ampacity (A):</label><input id="contactorData.ampacity" type="text" value={formData.contactorData.ampacity} onChange={(e) => handleChange('contactorData.ampacity', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    <div><label htmlFor="contactorData.controlVoltageV" className="form-label inline-block w-40">Control Voltage (V):</label><input id="contactorData.controlVoltageV" type="text" value={formData.contactorData.controlVoltageV} onChange={(e) => handleChange('contactorData.controlVoltageV', e.target.value)} readOnly={!isEditing} className={`form-input w-[calc(100%-10rem)] ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                </div>
            </div>
          </div>

          {/* Electrical Test - Contactor Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-electrical-test-contactor">Electrical Test - Contactor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Insulation Resistance - Contactor */}
              <div>
                <h3 className="text-md font-semibold mb-2">Insulation Resistance</h3>
                <div className="mb-2">
                  <label className="form-label mr-2">Test Voltage:</label>
                  <select value={formData.electricalTestContactor.insulationResistance.testVoltage} onChange={(e) => handleChange('electricalTestContactor.insulationResistance.testVoltage', e.target.value)} disabled={!isEditing} className={`form-select inline-block w-auto ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                    {insulationTestVoltageOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-dark-200">
                      <th className="p-2 border dark:border-gray-600">Test Voltage</th>
                      <th className="p-2 border dark:border-gray-600"></th>
                      <th className="p-2 border dark:border-gray-600">P1 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P2 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P3 MΩ Reading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.electricalTestContactor.insulationResistance.readings.map((row, index) => (
                      <tr key={`contactor-ir-${index}`}>
                        <td className="p-2 border dark:border-gray-600 font-medium">{row.test}</td>
                        <td className="p-2 border dark:border-gray-600 text-center">{row.state}</td>
                         {(['p1_mq', 'p2_mq', 'p3_mq'] as const).map(phase => (
                           <td key={phase} className="p-1 border dark:border-gray-600"><input type="text" value={row[phase]} onChange={(e) => handleListChange('electricalTestContactor.insulationResistance.readings', index, phase, e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Temperature Corrected - Contactor */}
              <div>
                <h3 className="text-md font-semibold mb-2">Temperature Corrected</h3>
                 <div className="mb-2">
                  <label className="form-label mr-2">Test Voltage:</label>
                  <input type="text" value={formData.electricalTestContactor.temperatureCorrected.testVoltage} readOnly className="form-input inline-block w-auto bg-gray-100 dark:bg-dark-200" />
                </div>
                <table className="min-w-full text-sm">
                   <thead>
                    <tr className="bg-gray-50 dark:bg-dark-200">
                      <th className="p-2 border dark:border-gray-600">Test Voltage</th>
                      <th className="p-2 border dark:border-gray-600"></th>
                      <th className="p-2 border dark:border-gray-600">P1 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P2 MΩ Reading</th>
                      <th className="p-2 border dark:border-gray-600">P3 MΩ Reading</th>
                    </tr>
                  </thead>
                  <tbody>
                     {formData.electricalTestContactor.temperatureCorrected.readings.map((row, index) => (
                      <tr key={`contactor-tc-ir-${index}`}>
                        <td className="p-2 border dark:border-gray-600 font-medium">{row.test}</td>
                        <td className="p-2 border dark:border-gray-600 text-center">{row.state}</td>
                        {(['p1_mq', 'p2_mq', 'p3_mq'] as const).map(phase => (
                           <td key={phase} className="p-1 border dark:border-gray-600"><input type="text" value={row[phase]} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Vacuum Bottle Integrity */}
            <div className="mt-6">
                <h3 className="text-md font-semibold mb-2">Vacuum Bottle Integrity (Breaker In Open Position)</h3>
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-dark-200">
                            <th className="p-2 border dark:border-gray-600">Test Voltage</th>
                            <th className="p-2 border dark:border-gray-600">Test Duration</th>
                            <th className="p-2 border dark:border-gray-600">P1</th>
                            <th className="p-2 border dark:border-gray-600">P2</th>
                            <th className="p-2 border dark:border-gray-600">P3</th>
                            <th className="p-2 border dark:border-gray-600">Units</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestContactor.vacuumBottleIntegrity.testVoltage} onChange={(e) => handleChange('electricalTestContactor.vacuumBottleIntegrity.testVoltage', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestContactor.vacuumBottleIntegrity.testDuration} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestContactor.vacuumBottleIntegrity.p1} onChange={(e) => handleChange('electricalTestContactor.vacuumBottleIntegrity.p1', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestContactor.vacuumBottleIntegrity.p2} onChange={(e) => handleChange('electricalTestContactor.vacuumBottleIntegrity.p2', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestContactor.vacuumBottleIntegrity.p3} onChange={(e) => handleChange('electricalTestContactor.vacuumBottleIntegrity.p3', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600">
                                <select value={formData.electricalTestContactor.vacuumBottleIntegrity.units} onChange={(e) => handleChange('electricalTestContactor.vacuumBottleIntegrity.units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                    <option value="">Select</option>
                                    <option value="kV">kV</option>
                                    <option value="mA">mA</option>
                                    {/* Add other relevant units */}
                                </select>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
          </div>
          
          {/* Starting Reactor Data Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-starting-reactor-data">Starting Reactor Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                <div><label htmlFor="startingReactorData.manufacturer" className="form-label block">Manufacturer:</label><input id="startingReactorData.manufacturer" type="text" value={formData.startingReactorData.manufacturer} onChange={(e) => handleChange('startingReactorData.manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="startingReactorData.catalogNumber" className="form-label block">Catalog Number:</label><input id="startingReactorData.catalogNumber" type="text" value={formData.startingReactorData.catalogNumber} onChange={(e) => handleChange('startingReactorData.catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="startingReactorData.serialNumber" className="form-label block">Serial Number:</label><input id="startingReactorData.serialNumber" type="text" value={formData.startingReactorData.serialNumber} onChange={(e) => handleChange('startingReactorData.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="startingReactorData.ratedCurrentA" className="form-label block">Rated Current (A):</label><input id="startingReactorData.ratedCurrentA" type="text" value={formData.startingReactorData.ratedCurrentA} onChange={(e) => handleChange('startingReactorData.ratedCurrentA', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="startingReactorData.ratedVoltageKV" className="form-label block">Rated Voltage (kV):</label><input id="startingReactorData.ratedVoltageKV" type="text" value={formData.startingReactorData.ratedVoltageKV} onChange={(e) => handleChange('startingReactorData.ratedVoltageKV', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                <div><label htmlFor="startingReactorData.operatingVoltageKV" className="form-label block">Operating Voltage (kV):</label><input id="startingReactorData.operatingVoltageKV" type="text" value={formData.startingReactorData.operatingVoltageKV} onChange={(e) => handleChange('startingReactorData.operatingVoltageKV', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            </div>
          </div>

          {/* Electrical Test - Reactor Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-electrical-test-reactor">Electrical Test - Reactor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Insulation Resistance Values - Reactor */}
                <div>
                    <h3 className="text-md font-semibold mb-2">Insulation Resistance Values</h3>
                    <div className="mb-2">
                        <label className="form-label mr-2">Test Voltage:</label>
                        <select value={formData.electricalTestReactor.insulationResistance.testVoltage} onChange={(e) => handleChange('electricalTestReactor.insulationResistance.testVoltage', e.target.value)} disabled={!isEditing} className={`form-select inline-block w-auto ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                            {insulationTestVoltageOptions.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                    <table className="min-w-full text-sm">
                        <thead><tr className="bg-gray-50 dark:bg-dark-200"><th className="p-2 border dark:border-gray-600">Winding to Ground</th><th className="p-2 border dark:border-gray-600">A-Phase</th><th className="p-2 border dark:border-gray-600">B-Phase</th><th className="p-2 border dark:border-gray-600">C-Phase</th><th className="p-2 border dark:border-gray-600">Units</th></tr></thead>
                        <tbody>
                            <tr>
                                <td className="p-2 border dark:border-gray-600 font-medium">Reading</td>
                                <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.insulationResistance.windingToGround.aPhase} onChange={(e) => handleChange('electricalTestReactor.insulationResistance.windingToGround.aPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.insulationResistance.windingToGround.bPhase} onChange={(e) => handleChange('electricalTestReactor.insulationResistance.windingToGround.bPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.insulationResistance.windingToGround.cPhase} onChange={(e) => handleChange('electricalTestReactor.insulationResistance.windingToGround.cPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="p-1 border dark:border-gray-600">
                                    <select value={formData.electricalTestReactor.insulationResistance.windingToGround.units} onChange={(e) => handleChange('electricalTestReactor.insulationResistance.windingToGround.units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                        {insulationResistanceUnitOptions.map(opt => <option key={opt.symbol} value={opt.symbol}>{opt.symbol}</option>)}
                                    </select>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                {/* Temperature Corrected Values - Reactor */}
                <div>
                    <h3 className="text-md font-semibold mb-2">Temperature Corrected Values</h3>
                     <div className="mb-2">
                        <label className="form-label mr-2">Test Voltage:</label>
                         <input type="text" value={formData.electricalTestReactor.temperatureCorrected.testVoltage} readOnly className="form-input inline-block w-auto bg-gray-100 dark:bg-dark-200" />
                    </div>
                    <table className="min-w-full text-sm">
                        <thead><tr className="bg-gray-50 dark:bg-dark-200"><th className="p-2 border dark:border-gray-600">Winding to Ground</th><th className="p-2 border dark:border-gray-600">A-Phase</th><th className="p-2 border dark:border-gray-600">B-Phase</th><th className="p-2 border dark:border-gray-600">C-Phase</th><th className="p-2 border dark:border-gray-600">Units</th></tr></thead>
                        <tbody>
                            <tr>
                                <td className="p-2 border dark:border-gray-600 font-medium">Reading</td>
                                <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.temperatureCorrected.windingToGround.aPhase} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.temperatureCorrected.windingToGround.bPhase} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.temperatureCorrected.windingToGround.cPhase} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.temperatureCorrected.windingToGround.units} readOnly className="form-input w-full text-center bg-gray-100 dark:bg-dark-200" /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Contact Resistance (As Found) - Reactor */}
            <div className="mt-6">
                <h3 className="text-md font-semibold mb-2">Contact Resistance (As Found)</h3>
                <table className="min-w-full text-sm">
                    <thead><tr className="bg-gray-50 dark:bg-dark-200"><th className="p-2 border dark:border-gray-600"></th><th className="p-2 border dark:border-gray-600">A-Phase</th><th className="p-2 border dark:border-gray-600">B-Phase</th><th className="p-2 border dark:border-gray-600">C-Phase</th><th className="p-2 border dark:border-gray-600">Units</th></tr></thead>
                    <tbody>
                        <tr>
                            <td className="p-2 border dark:border-gray-600 font-medium">Reading</td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.contactResistanceAsFound.aPhase} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsFound.aPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.contactResistanceAsFound.bPhase} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsFound.bPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.contactResistanceAsFound.cPhase} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsFound.cPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600">
                                <select value={formData.electricalTestReactor.contactResistanceAsFound.units} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsFound.units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                    {contactResistanceUnitOptions.map(opt => <option key={opt.symbol} value={opt.symbol}>{opt.symbol}</option>)}
                                </select>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            {/* Contact Resistance (As Left) - Reactor */}
            <div className="mt-6">
                <h3 className="text-md font-semibold mb-2">Contact Resistance (As Left)</h3>
                <table className="min-w-full text-sm">
                    <thead><tr className="bg-gray-50 dark:bg-dark-200"><th className="p-2 border dark:border-gray-600"></th><th className="p-2 border dark:border-gray-600">A-Phase</th><th className="p-2 border dark:border-gray-600">B-Phase</th><th className="p-2 border dark:border-gray-600">C-Phase</th><th className="p-2 border dark:border-gray-600">Units</th></tr></thead>
                    <tbody>
                        <tr>
                            <td className="p-2 border dark:border-gray-600 font-medium">Reading</td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.contactResistanceAsLeft.aPhase} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsLeft.aPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.contactResistanceAsLeft.bPhase} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsLeft.bPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600"><input type="text" value={formData.electricalTestReactor.contactResistanceAsLeft.cPhase} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsLeft.cPhase', e.target.value)} readOnly={!isEditing} className={`form-input w-full text-center ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                            <td className="p-1 border dark:border-gray-600">
                                <select value={formData.electricalTestReactor.contactResistanceAsLeft.units} onChange={(e) => handleChange('electricalTestReactor.contactResistanceAsLeft.units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                    {contactResistanceUnitOptions.map(opt => <option key={opt.symbol} value={opt.symbol}>{opt.symbol}</option>)}
                                </select>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
          </div>

          {/* Test Equipment Used Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-test-equipment">Test Equipment Used</h2>
            <div className="space-y-4">
              {([
                { key: 'megohmmeter', label: 'Megohmmeter' },
                { key: 'lowResistanceOhmmeter', label: 'Low-Resistance Ohmmeter' },
                { key: 'hipot', label: 'Hipot' }
              ] as const).map(equip => (
                <div key={equip.key} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="form-label block">{equip.label}:</label><input type="text" value={formData.testEquipmentUsed[equip.key].name} onChange={(e) => handleChange(`testEquipmentUsed.${equip.key}.name`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                  <div><label className="form-label block">Serial Number:</label><input type="text" value={formData.testEquipmentUsed[equip.key].serialNumber} onChange={(e) => handleChange(`testEquipmentUsed.${equip.key}.serialNumber`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                  <div><label className="form-label block">AMP ID:</label><input type="text" value={formData.testEquipmentUsed[equip.key].ampId} onChange={(e) => handleChange(`testEquipmentUsed.${equip.key}.ampId`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Comments Section */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-comments">Comments</h2>
            <textarea
              value={formData.comments}
              onChange={(e) => handleChange('comments', e.target.value)}
              readOnly={!isEditing}
              rows={6}
              className={`form-textarea w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              placeholder="Enter comments here..."
            />
        </div>
      </div>
    </ReportWrapper>
  );
};

// Add print styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide navigation bar and scrollbar */
    nav, header, .navigation, [class*="nav"], [class*="header"] {
      display: none !important;
    }
    ::-webkit-scrollbar { display: none; }
    html { -ms-overflow-style: none; scrollbar-width: none; height: 100%; }
    body { overflow-x: hidden; min-height: 100vh; padding-bottom: 100px; }
    textarea { min-height: 200px !important; }



    @media print {
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
        margin: 0.1in;
      }
      
      /* Hide all non-print elements */
      .print\\:hidden { display: none !important; }
      
      /* Hide second title and back button in print only */
      .flex.justify-between.items-center.mb-6 { display: none !important; }
      .flex.items-center.gap-4 { display: none !important; }
      button { display: none !important; }
      
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
      
      /* Table styling for print */
      table { 
        border-collapse: collapse !important; 
        width: 100% !important; 
        page-break-inside: avoid !important;
      }
      th, td { 
        border: 1px solid black !important; 
        padding: 4px !important; 
        color: black !important; 
        font-size: 10px !important; 
        text-align: center !important;
      }
      th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
      }
      
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
      
      /* Force table to fit on page */
      .overflow-x-auto {
        overflow: visible !important;
      }
      
      /* Force sections to be visible and prevent cutting */
      section {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        margin-bottom: 20px !important;
        padding: 16px !important;
        border: 2px solid black !important;
        background-color: white !important;
        border-radius: 0 !important;
      }
      
      /* Ensure proper spacing between sections */
      .space-y-6 > * + * {
        margin-top: 20px !important;
      }
      
      /* Enhanced styling for test equipment section */
      #equipment-heading + div {
        display: grid !important;
        grid-template-columns: 1fr 1fr 1fr !important;
        gap: 16px !important;
      }
      
      /* Enhanced styling for comments section */
      textarea {
        min-height: 100px !important;
        max-height: none !important;
        resize: none !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        font-family: Arial, sans-serif !important;
        line-height: 1.4 !important;
        overflow: visible !important;
        display: block !important;
        width: 100% !important;
        border: 1px solid black !important;
        background-color: white !important;
        color: black !important;
        padding: 8px !important;
        font-size: 11px !important;
        margin-top: 8px !important;
      }
      
      /* Ensure test equipment fields are clearly labeled */
      .form-label {
        display: block !important;
        margin-bottom: 4px !important;
        font-weight: 600 !important;
        color: black !important;
      }
      
      /* Grid layout for test equipment in print */
      .grid.grid-cols-1.md\\:grid-cols-3 {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 16px !important;
      }
      
      /* Ensure comments section has proper spacing and doesn't get cut */
      #comments-heading {
        margin-bottom: 12px !important;
        padding-bottom: 8px !important;
        border-bottom: 1px solid black !important;
      }
      
      /* Hide any interactive elements that shouldn't print */
      button {
        display: none !important;
      }
      
      /* Special handling for empty comments */
      textarea:empty::before {
        content: "No comments entered" !important;
        color: #666 !important;
        font-style: italic !important;
      }
      
      /* Card styling improvements */
      .bg-white.dark\\:bg-dark-150 {
        background-color: white !important;
        border: 2px solid black !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        margin-bottom: 20px !important;
        padding: 16px !important;
      }
      
      /* Section headers */
      h2 {
        font-size: 18px !important;
        font-weight: bold !important;
        margin-bottom: 12px !important;
        padding-bottom: 8px !important;
        border-bottom: 1px solid black !important;
        color: black !important;
      }
      
      /* Form inputs in cards */
      .form-input, .form-select {
        border: 1px solid black !important;
        background-color: white !important;
        color: black !important;
        padding: 4px 6px !important;
        font-size: 11px !important;
        width: 100% !important;
        display: block !important;
      }
      
      /* Grid layouts in cards */
      .grid.grid-cols-1.md\\:grid-cols-2 {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 16px !important;
      }
      
      /* Labels in cards */
      .form-label.inline-block {
        display: inline-block !important;
        width: 120px !important;
        font-weight: 600 !important;
        color: black !important;
        margin-right: 8px !important;
      }
      
      /* Temperature and humidity display */
      .flex.items-center {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }
      
      /* Ensure comments section doesn't get cut off */
      section:last-child {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-bottom: 0 !important;
      }
      
      /* Force all content to be visible */
      .overflow-hidden {
        overflow: visible !important;
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
      
      /* Remove pseudo-element - not working properly */
      h2::before {
        display: none !important;
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
      
      /* Remove any div that might create boxes */
      div[class*="border"], div[class*="shadow"], div[class*="rounded"] {
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
      
      /* Ensure no padding on any containers */
      div[class*="p-"], div[class*="px-"], div[class*="py-"], div[class*="pt-"], div[class*="pb-"], div[class*="pl-"], div[class*="pr-"] {
        padding: 0 !important;
      }
      
      /* FORCE remove all borders and boxes from everything except tables */
      * {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
      }
      
      /* Specifically target and remove print borders */
      .print\\:border {
        border: none !important;
      }
      
      .print\\:border-black {
        border: none !important;
      }
      
      /* Remove borders from divs with these specific classes */
      div.bg-white, div.dark\\:bg-dark-150, div.print\\:border, div.print\\:border-black {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      
      /* Only allow borders on table elements */
      table, th, td, thead, tbody, tr {
        border: 1px solid black !important;
      }
      
      /* Ensure table has outer border */
      table {
        border: 1.5px solid black !important;
      }
      
      /* Allow borders on inputs */
      input, select, textarea {
        border-bottom: 1px solid black !important;
      }
      
      textarea {
        border: 1px solid black !important; 
      }
      
      /* Form grid layout - ultra compact */
      .grid {
        display: grid !important;
        gap: 1px !important;
        margin-bottom: 2px !important;
      }
      
      /* Job info section - ultra compact horizontal layout */
      .grid-cols-1.md\\:grid-cols-4 {
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Large screen job info - 6 columns */
      .grid-cols-1.md\\:grid-cols-4.lg\\:grid-cols-6 {
        grid-template-columns: repeat(6, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Device data section - ultra compact horizontal layout */
      .grid-cols-1.md\\:grid-cols-4.lg\\:grid-cols-4 {
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Nameplate data section - ultra compact horizontal layout */
      .grid-cols-1.md\\:grid-cols-2 {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Fuse data section - ultra compact horizontal layout */
      .grid-cols-1.md\\:grid-cols-3 {
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Test equipment section - ultra compact horizontal layout */
      .grid-cols-1.md\\:grid-cols-3 {
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 4px !important;
      }
      
      /* Labels and inputs - better fit for data */
      label {
        font-size: 8px !important;
        font-weight: normal !important;
        margin: 0 !important;
        display: inline-block !important;
        margin-right: 2px !important;
        width: auto !important;
      }
      
      input, select, textarea { 
        width: 70px !important;
        border: 1px solid black !important; 
        background: white !important;
        padding: 2px 3px !important;
        margin: 0 !important;
        font-size: 8px !important;
        height: 12px !important;
        display: inline-block !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        appearance: none !important;
      }
      
      /* Specific width for common inputs */
      input[type="text"], input[type="number"] {
        width: 70px !important;
      }
      
      /* Wider inputs for certain fields */
      input[type="date"] {
        width: 80px !important;
      }
      
      /* Temperature inputs */
      input[id*="temperature"] {
        width: 50px !important;
      }
      
      /* Job info specific inputs */
      .grid-cols-1.md\\:grid-cols-4 input[type="text"] {
        width: 90px !important;
      }
      
      /* Large screen job info inputs */
      .grid-cols-1.md\\:grid-cols-4.lg\\:grid-cols-6 input[type="text"] {
        width: 80px !important;
      }
      
      /* Device data specific inputs */
      .grid-cols-1.md\\:grid-cols-4.lg\\:grid-cols-4 input[type="text"] {
        width: 80px !important;
      }
      
      /* Customer field - smaller font for long names */
      input[value*="Cadell"], input[id*="customer"], input[name*="customer"] {
        font-size: 6px !important;
      }
      
      /* Table inputs - better fit for data */
      table input[type="text"], table select {
        width: 60px !important;
        max-width: 60px !important;
        border: 1px solid black !important;
        background: white !important;
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
      
      /* Table styles - proper fillable report format */
      table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin: 1px 0 !important;
        font-size: 8px !important;
        page-break-inside: avoid !important;
        margin-bottom: 16px !important;
        border: 1.5px solid black !important;
      }
      
      /* Specific input styling in tables */
      table input, table select {
        border: 1px solid black !important;
        padding: 2px 3px !important;
        margin: 0 !important;
        height: 12px !important;
        text-align: left !important;
        width: 60px !important;
        font-size: 8px !important;
        background: white !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        vertical-align: middle !important;
        display: inline-block !important;
      }
      
      /* Visual/Mechanical inspection table specific */
      table:has(th:contains("Results")) select {
        width: 90px !important;
        font-size: 7px !important;
      }
      
      /* Align text with input fields */
      td input, td select, td textarea {
        border: 1px solid black !important;
        background: white !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        outline: none !important;
        vertical-align: middle !important;
        margin-right: 4px !important;
      }
      
      /* Ensure all text content is visible in table cells */
      td {
        border: 1px solid black !important;
        padding: 2px 3px !important;
        vertical-align: middle !important;
        text-align: left !important;
        background: white !important;
        color: black !important;
        font-size: 8px !important;
        line-height: 1.2 !important;
        min-height: 16px !important;
        display: table-cell !important;
      }
      
      /* Make sure text content is visible */
      td * {
        color: black !important;
        background: transparent !important;
      }
      
      /* Ensure table headers are visible */
      th {
        border: 1px solid black !important;
        padding: 2px 3px !important;
        background-color: #f0f0f0 !important;
        font-weight: bold !important;
        color: black !important;
        font-size: 8px !important;
        text-align: left !important;
        vertical-align: middle !important;
      }
      
      /* Align text after input fields */
      td span, td:after {
        vertical-align: middle !important;
        display: inline-block !important;
        margin-left: 2px !important;
        color: black !important;
      }
      
      /* Force table cell inputs to not interfere with table borders */
      td input, td select, td textarea {
        border: 1px solid black !important;
        background: white !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        outline: none !important;
        color: black !important;
        font-size: 8px !important;
        vertical-align: middle !important;
      }
      
      /* Form label specific styling */
      .form-label {
        font-size: 8px !important;
        font-weight: normal !important;
        margin: 0 !important;
        display: inline-block !important;
        margin-right: 4px !important;
        width: auto !important;
        min-width: 0 !important;
      }
      
      /* Ensure form inputs are properly sized */
      .form-input, .form-select {
        width: 70px !important;
        border: 1px solid black !important;
        background: white !important;
        padding: 2px 3px !important;
        font-size: 8px !important;
        height: 12px !important;
      }
      
      /* Remove all spacing classes */
      .space-y-4 > * + *, .space-y-6 > * + * { margin-top: 2px !important; }
      .mb-4 { margin-bottom: 2px !important; }
      .mb-6 { margin-bottom: 3px !important; }
      .mb-8 { margin-bottom: 3px !important; }
      .p-6 { padding: 0 !important; }
      
      /* Force full page width */
      body, html {
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Remove any max-width constraints */
      * {
        max-width: none !important;
      }
      
      /* Ensure containers use full width */
      div {
        width: 100% !important;
        max-width: none !important;
      }
      
      /* PASS/FAIL status badge */
      .bg-green-600, .bg-red-600 {
        background-color: transparent !important;
        color: black !important;
        border: 1px solid black !important;
        padding: 0px 2px !important;
        font-weight: bold !important;
        font-size: 9px !important;
      }
      
      /* Status in header */
      .text-green-600 { color: green !important; }
      .text-red-600 { color: red !important; }
      
      /* Comments section */
      .min-h-[250px] {
        min-height: 20px !important;
      }
      
      /* Footer text */
      .text-xs {
        font-size: 7px !important;
      }
      
      /* Force single-line layout for form fields */
      .flex.items-center {
        display: inline-flex !important;
        margin-right: 10px !important;
      }
      
      /* Page break control */
      section { page-break-inside: avoid !important; }
      
      /* Ensure everything fits on one page */
      .max-w-7xl { 
        max-width: 100% !important; 
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Force full width layout */
      .p-6 { 
        padding: 0 !important; 
        margin: 0 !important;
        width: 100% !important;
      }
      
      /* Remove any container constraints */
      .space-y-6 > * + * { 
        margin-top: 4px !important; 
      }
      
      /* Orange header bar for sections */
      .border-b.dark\\:border-gray-700 {
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Specific section spacing */
      section {
        margin-bottom: 2px !important;
        padding: 0 !important;
      }
      
      /* Print header specific */
      .print\\:flex {
        margin-bottom: 3px !important;
      }
      
      /* Center the title and status in print */
      .print\\:flex .flex-1.text-center {
        text-align: center !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        position: absolute !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: auto !important;
      }
      
      /* Status badge in print header */
      .print\\:flex .bg-green-600, .print\\:flex .bg-red-600 {
        background-color: transparent !important;
        color: black !important;
        border: 2px solid black !important;
        padding: 2px 8px !important;
        font-weight: bold !important;
        font-size: 12px !important;
        margin-top: 4px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* PASS/FAIL status badge styling */
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
      
      /* Force green background for PASS status */
      div[style*="background-color: #22c55e"] {
        background-color: #22c55e !important;
        border: 2px solid #16a34a !important;
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
      
      /* SUPER-SPECIFIC OVERRIDES - Must be last to override Tailwind */
      div[class*='print:border'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      div[class*='print:border-black'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      div.bg-white, div[class*='bg-white'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      div[class*='shadow'], div[class*='rounded'] {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
        border-radius: 0 !important;
      }
      
      /* Remove border from all direct children of .max-w-7xl in print */
      .max-w-7xl > div {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      /* Nuclear option - remove borders from all divs except those containing tables */
      div:not(:has(table)) {
        border: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      
      /* FINAL OVERRIDE: Force orange dividers for specific sections */
      /* Job Information divider */
      .max-w-7xl h2.section-job-info {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Nameplate Data divider */
      .max-w-7xl h2.section-nameplate-data {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Visual and Mechanical Inspection divider */
      .max-w-7xl h2.section-visual-mechanical {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Fuse Data divider */
      .max-w-7xl h2.section-fuse-data {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Electrical Tests divider */
      .max-w-7xl h2.section-electrical-tests {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Contactor Data divider */
      .max-w-7xl h2.section-contactor-data {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Electrical Test - Contactor divider */
      .max-w-7xl h2.section-electrical-test-contactor {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Starting Reactor Data divider */
      .max-w-7xl h2.section-starting-reactor-data {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Electrical Test - Reactor divider */
      .max-w-7xl h2.section-electrical-test-reactor {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Test Equipment Used divider */
      .max-w-7xl h2.section-test-equipment {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      /* Comments divider */
      .max-w-7xl h2.section-comments {
        border-top: 2px solid #f26722 !important;
        padding-top: 4px !important;
        margin-top: 8px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      

    }
  `;
  document.head.appendChild(style);
}

export default MediumVoltageMotorStarterMTSReport; 