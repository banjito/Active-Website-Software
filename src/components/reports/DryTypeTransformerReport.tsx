import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import _ from 'lodash';

// Temperature conversion and TCF tables
const tempConvTable = [
  [-11.2, -24], [-9.4, -23], [-7.6, -22],
  [68, 20], [70, 21], [72, 22],
  [73.4, 23]
];

const tcfTable = [
  [-24, 0.048], [-23, 0.051], [-22, 0.055],
  [20, 1.0], [21, 1.076], [22, 1.152],
  [23, 1.233]
];

// Dropdown options
const visualInspectionOptions = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable"
];

const insulationResistanceUnits = [
  { symbol: "kΩ", name: "Kilo-Ohms" },
  { symbol: "MΩ", name: "Mega-Ohms" },
  { symbol: "GΩ", name: "Giga-Ohms" }
];

const testVoltageOptions = [
  "250V", "500V", "1000V",
  "2500V", "5000V", "10000V"
];

interface FormData {
  // Job Information
  customer: string;
  address: string;
  date: string;
  technicians: string;
  jobNumber: string;
  substation: string;
  eqptLocation: string;
  identifier: string;
  userName: string;
  temperature: {
    ambient: number;
    celsius: number;
    fahrenheit: number;
    correctionFactor: number;
  };

  // Nameplate Data
  nameplateData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    kva: string;
    kvaSecondary: string;
    tempRise: string;
    impedance: string;
    primary: {
      volts: string;
      voltsSecondary: string;
      connection: string;
      material: string;
    };
    secondary: {
      volts: string;
      voltsSecondary: string;
      connection: string;
      material: string;
    };
    tapConfiguration: {
      positions: number[];
      voltages: string[];
      currentPosition: number;
      currentPositionSecondary: string;
      tapVoltsSpecific: string;
      tapPercentSpecific: string;
    };
  };

  // Visual Inspection
  visualInspectionItems: {
    id: string;
    description: string;
    result: string;
    comments: string;
  }[];

  // Insulation Resistance
  insulationResistance: {
    primaryToGround: {
      testVoltage: string;
      unit: string;
      readings: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      corrected: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      dielectricAbsorption: string;
      polarizationIndex: string;
    };
    secondaryToGround: {
      testVoltage: string;
      unit: string;
      readings: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      corrected: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      dielectricAbsorption: string;
      polarizationIndex: string;
    };
    primaryToSecondary: {
      testVoltage: string;
      unit: string;
      readings: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      corrected: {
        halfMinute: string;
        oneMinute: string;
        tenMinute: string;
      };
      dielectricAbsorption: string;
      polarizationIndex: string;
    };
    dielectricAbsorptionAcceptable: string;
    polarizationIndexAcceptable: string;
  };

  // Test Equipment
  testEquipment: {
    megohmmeter: {
      name: string;
      serialNumber: string;
      ampId: string;
    };
  };

  comments: string;
  status: string;
}

// Helper function to calculate corrected value
const calculateCorrectedValue = (readingStr: string, tcf: number): string => {
  const readingNum = parseFloat(readingStr);
  if (isNaN(readingNum) || !isFinite(readingNum)) {
    return ''; // Return empty if reading is not a valid number
  }
  const corrected = readingNum * tcf;
  return corrected.toFixed(2); // Format to 2 decimal places, adjust as needed
};

// Helper function to calculate DA/PI ratio
const calculateRatio = (numeratorStr: string, denominatorStr: string): string => {
  const numerator = parseFloat(numeratorStr);
  const denominator = parseFloat(denominatorStr);

  if (isNaN(numerator) || isNaN(denominator) || !isFinite(numerator) || !isFinite(denominator) || denominator === 0) {
    return ''; // Return empty if inputs are invalid or denominator is zero
  }

  const ratio = numerator / denominator;
  return ratio.toFixed(2); // Format to 2 decimal places
};

const DryTypeTransformerReport: React.FC = () => {
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
  const reportSlug = 'dry-type-transformer'; // This component handles the dry-type-transformer route
  const reportName = getReportName(reportSlug);
  
  // Initialize form data with default values
  const [formData, setFormData] = useState<FormData>({
    customer: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
    technicians: '',
    jobNumber: '',
    substation: '',
    eqptLocation: '',
    identifier: '',
    userName: '',
    temperature: {
      ambient: 72,
      celsius: 22,
      fahrenheit: 72,
      correctionFactor: 1.152
    },
    nameplateData: {
      manufacturer: '',
      catalogNumber: '',
      serialNumber: '',
      kva: '',
      kvaSecondary: '',
      tempRise: '',
      impedance: '',
      primary: {
        volts: '480',
        voltsSecondary: '',
        connection: 'Delta',
        material: 'Aluminum'
      },
      secondary: {
        volts: '',
        voltsSecondary: '',
        connection: 'Wye',
        material: 'Aluminum'
      },
      tapConfiguration: {
        positions: [1, 2, 3, 4, 5, 6, 7],
        voltages: ['', '', '', '', '', '-', '-'],
        currentPosition: 3,
        currentPositionSecondary: '',
        tapVoltsSpecific: '',
        tapPercentSpecific: ''
      }
    },
    visualInspectionItems: [
      { id: '7.2.2.A.1', description: 'Compare equipment nameplate data with drawings and specifications.', result: '', comments: '' },
      { id: '7.2.2.A.2', description: 'Inspect physical and mechanical condition.', result: '', comments: '' },
      { id: '7.2.2.A.3', description: 'Inspect impact recorder prior to unloading.', result: '', comments: '' },
      { id: '7.2.2.A.4', description: 'Test dew point of tank gases. *Optional', result: '', comments: '' },
      { id: '7.2.2.A.5', description: 'Inspect anchorage, alignment, and grounding.', result: '', comments: '' },
      { id: '7.2.2.A.6', description: 'Verify the presence of PCB content labeling.', result: '', comments: '' },
      { id: '7.2.2.A.7', description: 'Verify removal of any shipping bracing after placement.', result: '', comments: '' },
      { id: '7.2.2.A.8', description: 'Verify the bushings are clean.', result: '', comments: '' },
      { id: '7.2.2.A.9', description: 'Verify that alarm, control, and trip settings on temperature and level indicators are as specified.', result: '', comments: '' },
      { id: '7.2.2.A.10', description: 'Verify operation of alarm, control, and trip circuits from temperature and level indicators, pressure relief device, gas accumulator, and fault pressure relay.', result: '', comments: '' },
      { id: '7.2.2.A.11', description: 'Verify that cooling fans and pumps operate correctly and have appropriate overcurrent protection.', result: '', comments: '' },
      { id: '7.2.2.A.12', description: 'Inspect bolted electrical connections for high resistance using low-resistance ohmmeter, calibrated torquewrench, or thermographic survey.', result: '', comments: '' },
      { id: '7.2.2.A.13', description: 'Verify correct liquid level in tanks and bushings.', result: '', comments: '' },
      { id: '7.2.2.A.14', description: 'Verify valves are in the correct operating position.', result: '', comments: '' },
      { id: '7.2.2.A.15', description: 'Verify that positive pressure is maintained on gas-blanketed transformers.', result: '', comments: '' },
      { id: '7.2.2.A.16', description: 'Perform inspections and mechanical tests as recommended by the manufacturer.', result: '', comments: '' },
      { id: '7.2.2.A.17', description: 'Test load tap-changer in accordance with Section 7.12.3.', result: '', comments: '' },
      { id: '7.2.2.A.18', description: 'Verify presence of transformer surge arresters.', result: '', comments: '' },
      { id: '7.2.2.A.19', description: 'Verify de-energized tap-changer position is left as specified.', result: '', comments: '' }
    ],
    insulationResistance: {
      primaryToGround: {
        testVoltage: "5000V",
        unit: "MΩ",
        readings: {
          halfMinute: "",
          oneMinute: "",
          tenMinute: ""
        },
        corrected: {
          halfMinute: "",
          oneMinute: "",
          tenMinute: ""
        },
        dielectricAbsorption: '',
        polarizationIndex: ''
      },
      secondaryToGround: {
        testVoltage: "1000V",
        unit: "MΩ",
        readings: {
          halfMinute: "",
          oneMinute: "",
          tenMinute: ""
        },
        corrected: {
          halfMinute: "",
          oneMinute: "",
          tenMinute: ""
        },
        dielectricAbsorption: '',
        polarizationIndex: ''
      },
      primaryToSecondary: {
        testVoltage: "5000V",
        unit: "MΩ",
        readings: {
          halfMinute: "",
          oneMinute: "",
          tenMinute: ""
        },
        corrected: {
          halfMinute: "",
          oneMinute: "",
          tenMinute: ""
        },
        dielectricAbsorption: '',
        polarizationIndex: ''
      },
      dielectricAbsorptionAcceptable: '',
      polarizationIndexAcceptable: ''
    },
    testEquipment: {
      megohmmeter: {
        name: '',
        serialNumber: '',
        ampId: ''
      }
    },
    comments: '',
    status: 'PASS'
  });

  // Helper function to get visual inspection description
  const getVisualInspectionDescription = (id: string): string => {
    const descriptions: { [key: string]: string } = {
      "7.2.2.A.1": "Compare equipment nameplate data with drawings and specifications.",
      "7.2.2.A.2": "Inspect physical and mechanical condition.",
      "7.2.2.A.3": "Inspect impact recorder prior to unloading.",
      "7.2.2.A.4*": "Test dew point of tank gases. *Optional",
      "7.2.2.A.5": "Inspect anchorage, alignment, and grounding.",
      "7.2.2.A.6": "Verify the presence of PCB content labeling.",
      "7.2.2.A.7": "Verify removal of any shipping bracing after placement.",
      "7.2.2.A.8": "Verify the bushings are clean.",
      "7.2.2.A.9": "Verify that alarm, control, and trip settings on temperature and level indicators are as specified.",
      "7.2.2.A.10": "Verify operation of alarm, control, and trip circuits from temperature and level indicators, pressure relief device, gas accumulator, and fault pressure relay.",
      "7.2.2.A.11": "Verify that cooling fans and pumps operate correctly and have appropriate overcurrent protection.",
      "7.2.2.A.12": "Inspect bolted electrical connections for high resistance using low-resistance ohmmeter, calibrated torquewrench, or thermographic survey.",
      "7.2.2.A.13": "Verify correct liquid level in tanks and bushings.",
      "7.2.2.A.14": "Verify valves are in the correct operating position.",
      "7.2.2.A.15": "Verify that positive pressure is maintained on gas-blanketed transformers.",
      "7.2.2.A.16": "Perform inspections and mechanical tests as recommended by the manufacturer.",
      "7.2.2.A.17": "Test load tap-changer in accordance with Section 7.12.3.",
      "7.2.2.A.18": "Verify presence of transformer surge arresters.",
      "7.2.2.A.19": "Verify de-energized tap-changer position is left as specified.",
    };
    return descriptions[id] || '';
  };

  // Handle temperature changes
  const handleTemperatureChange = (fahrenheit: number) => {
    // Find the closest match in the temperature conversion table
    const closestMatch = tempConvTable.reduce((prev, curr) => {
      return Math.abs(curr[0] - fahrenheit) < Math.abs(prev[0] - fahrenheit) ? curr : prev;
    });
    
    const celsius = closestMatch[1];
    
    // Find the correction factor from the TCF table
    const tcfMatch = tcfTable.find(item => item[0] === celsius) || [0, 1];
    const correctionFactor = tcfMatch[1];
    
    setFormData(prev => ({
      ...prev,
      temperature: {
        ambient: fahrenheit,
        celsius,
        fahrenheit,
        correctionFactor
      }
    }));
  };

  // Handle form field changes
  const handleChange = (section: string | null, field: string, value: any) => {
    setFormData(prev => {
      if (section) {
        return {
          ...prev,
          [section]: {
            ...prev[section],
            [field]: value
          }
        };
      } else {
        return {
          ...prev,
          [field]: value
        };
      }
    });
  };

  const handleNestedChange = (section: string, field: string | number, value: any) => {
    setFormData(prev => {
      if (section === 'visualInspectionItems') {
        const newItems = [...prev.visualInspectionItems];
        const index = field as number;
        if (typeof value === 'object') {
          newItems[index] = { ...newItems[index], ...value };
        } else {
          newItems[index] = { ...newItems[index], result: value };
        }
        return { ...prev, visualInspectionItems: newItems };
      }
      
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      };
    });
  };

  const handleDeepNestedChange = (section: string, subsection: string, nestedSection: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: {
          ...prev[section][subsection],
          [nestedSection]: {
            ...prev[section][subsection][nestedSection],
            [field]: value
          }
        }
      }
    }));
  };

  const handleVisualInspectionChange = (index: number, field: 'result' | 'comments', value: string) => {
    setFormData(prev => {
      const newItems = [...prev.visualInspectionItems];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, visualInspectionItems: newItems };
    });
  };

  // useEffect to calculate corrected values, DA, and PI
  useEffect(() => {
    const tcf = formData.temperature.correctionFactor;

    const updateCalculatedValues = (testId: keyof FormData['insulationResistance']) => {
      // Ensure testId refers to a structure with readings before accessing
      if (testId !== 'primaryToGround' && testId !== 'secondaryToGround' && testId !== 'primaryToSecondary') {
        // Return default/empty structure if testId is not a valid test key
        return {
          corrected: { halfMinute: '', oneMinute: '', tenMinute: '' },
          dielectricAbsorption: '',
          polarizationIndex: ''
        };
      }

      const testRecord = formData.insulationResistance[testId];
      const readings = testRecord.readings;

      const corrected = {
        halfMinute: calculateCorrectedValue(readings.halfMinute, tcf),
        oneMinute: calculateCorrectedValue(readings.oneMinute, tcf),
        tenMinute: calculateCorrectedValue(readings.tenMinute, tcf),
      };
      const dielectricAbsorption = calculateRatio(readings.oneMinute, readings.halfMinute);
      const polarizationIndex = calculateRatio(readings.tenMinute, readings.oneMinute);
      return { corrected, dielectricAbsorption, polarizationIndex };
    };

    // Check if insulationResistance exists before trying to update
    if (formData.insulationResistance) {
      setFormData(prev => {
        const primaryCalcs = updateCalculatedValues('primaryToGround');
        const secondaryCalcs = updateCalculatedValues('secondaryToGround');
        const primarySecondaryCalcs = updateCalculatedValues('primaryToSecondary');

        const prevPrimary = prev.insulationResistance.primaryToGround;
        const prevSecondary = prev.insulationResistance.secondaryToGround;
        const prevPrimarySecondary = prev.insulationResistance.primaryToSecondary;

        // Determine Acceptable status
        const daValues = [
          primaryCalcs.dielectricAbsorption,
          secondaryCalcs.dielectricAbsorption,
          primarySecondaryCalcs.dielectricAbsorption
        ].map(v => parseFloat(v));
        const daAcceptable = daValues.every(v => !isNaN(v) && v > 1) ? 'Yes' : 'No';

        const piValues = [
            primaryCalcs.polarizationIndex,
            secondaryCalcs.polarizationIndex,
            primarySecondaryCalcs.polarizationIndex
        ].map(v => parseFloat(v));
        const piAcceptable = piValues.every(v => !isNaN(v) && v > 1) ? 'Yes' : 'No';


        // Check if any calculated value actually changed
        if (
          !_.isEqual(prevPrimary.corrected, primaryCalcs.corrected) ||
          !_.isEqual(prevSecondary.corrected, secondaryCalcs.corrected) ||
          !_.isEqual(prevPrimarySecondary.corrected, primarySecondaryCalcs.corrected) ||
          prevPrimary.dielectricAbsorption !== primaryCalcs.dielectricAbsorption ||
          prevSecondary.dielectricAbsorption !== secondaryCalcs.dielectricAbsorption ||
          prevPrimarySecondary.dielectricAbsorption !== primarySecondaryCalcs.dielectricAbsorption ||
          prevPrimary.polarizationIndex !== primaryCalcs.polarizationIndex ||
          prevSecondary.polarizationIndex !== secondaryCalcs.polarizationIndex ||
          prevPrimarySecondary.polarizationIndex !== primarySecondaryCalcs.polarizationIndex ||
          prev.insulationResistance.dielectricAbsorptionAcceptable !== daAcceptable || // Check Acceptable change
          prev.insulationResistance.polarizationIndexAcceptable !== piAcceptable      // Check Acceptable change
        ) {
          return {
            ...prev,
            insulationResistance: {
              ...prev.insulationResistance,
              primaryToGround: {
                ...prevPrimary,
                corrected: primaryCalcs.corrected,
                dielectricAbsorption: primaryCalcs.dielectricAbsorption,
                polarizationIndex: primaryCalcs.polarizationIndex,
              },
              secondaryToGround: {
                ...prevSecondary,
                corrected: secondaryCalcs.corrected,
                dielectricAbsorption: secondaryCalcs.dielectricAbsorption,
                polarizationIndex: secondaryCalcs.polarizationIndex,
              },
              primaryToSecondary: {
                ...prevPrimarySecondary,
                corrected: primarySecondaryCalcs.corrected,
                dielectricAbsorption: primarySecondaryCalcs.dielectricAbsorption,
                polarizationIndex: primarySecondaryCalcs.polarizationIndex,
              },
              dielectricAbsorptionAcceptable: daAcceptable, // Update state
              polarizationIndexAcceptable: piAcceptable,    // Update state
            },
          };
        }
        return prev; // No change needed
      });
    }

  }, [
    formData.insulationResistance?.primaryToGround?.readings,
    formData.insulationResistance?.secondaryToGround?.readings,
    formData.insulationResistance?.primaryToSecondary?.readings,
    formData.temperature.correctionFactor,
    formData.insulationResistance
  ]);

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;
    
    try {
      setLoading(true);
      // First fetch job data from neta_ops schema
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
        // Then fetch customer data from common schema
        let customerName = '';
        let customerAddress = '';
        
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
      console.error('Error fetching job details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load existing report
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
        .from('transformer_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`Report with ID ${reportId} not found. Starting new report.`);
          setIsEditing(true);
        } else {
          throw error;
        }
      }

      if (data) {
        console.log("Loaded report data:", data);
        setFormData({
          ...formData,
          customer: data.report_info?.customer || formData.customer,
          address: data.report_info?.address || formData.address,
          date: data.report_info?.date || formData.date,
          technicians: data.report_info?.technicians || '',
          jobNumber: data.report_info?.jobNumber || formData.jobNumber,
          substation: data.report_info?.substation || '',
          eqptLocation: data.report_info?.eqptLocation || '',
          identifier: data.report_info?.identifier || '',
          userName: data.report_info?.userName || '',
          temperature: data.report_info?.temperature || formData.temperature,
          status: data.report_info?.status || 'PASS',
          comments: data.report_info?.comments || '', // Move comments inside report_info
          nameplateData: data.report_info?.nameplateData || formData.nameplateData,
          visualInspectionItems: data.visual_inspection?.items || formData.visualInspectionItems,
          insulationResistance: data.insulation_resistance?.tests || formData.insulationResistance,
          testEquipment: data.test_equipment || formData.testEquipment,
        });
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading transformer report:', error);
      setIsEditing(true);
    } finally {
      setLoading(false);
    }
  };

  // Save report
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    const reportData = {
      job_id: jobId,
      user_id: user.id,
      report_info: {
        customer: formData.customer,
        address: formData.address,
        date: formData.date,
        technicians: formData.technicians,
        jobNumber: formData.jobNumber,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        identifier: formData.identifier,
        userName: formData.userName,
        temperature: formData.temperature,
        nameplateData: formData.nameplateData,
        status: formData.status,
        comments: formData.comments // Move comments inside report_info
      },
      visual_inspection: {
        items: formData.visualInspectionItems
      },
      insulation_resistance: {
        tests: formData.insulationResistance
      },
      test_equipment: formData.testEquipment
    };
    console.log("Saving transformer report data:", reportData);

    try {
      let result;
      let currentReportId = reportId; // Use the reportId from the URL for updates

      if (currentReportId) {
        // Update existing report
        console.log(`Updating transformer_reports with ID: ${currentReportId}`);
        result = await supabase
          .schema('neta_ops')
          .from('transformer_reports') // <--- Use correct table name
          .update(reportData)
          .eq('id', currentReportId)
          .select()
          .single();
      } else {
        // Create new report
        console.log(`Inserting into transformer_reports for job ID: ${jobId}`);
        result = await supabase
          .schema('neta_ops')
          .from('transformer_reports') // <--- Use correct table name
          .insert(reportData)
          .select()
          .single();

        if (result.data) {
           currentReportId = result.data.id; // Get the new report ID
           console.log(`New report created with ID: ${currentReportId}`);
           // Create asset entry
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/dry-type-transformer/${currentReportId}`,
            user_id: user.id
          };
           console.log("Creating asset:", assetData);

          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();

          if (assetError) throw assetError;
           console.log("Asset created:", assetResult);

          // Link asset to job
           console.log(`Linking asset ${assetResult.id} to job ${jobId}`);
          await supabase
            .schema('neta_ops')
            .from('job_assets')
            .insert({
              job_id: jobId,
              asset_id: assetResult.id,
              user_id: user.id
            });
            console.log("Asset linked.");

           // Optional: Navigate to the new report's URL if desired
           // navigate(`/jobs/${jobId}/dry-type-transformer/${currentReportId}`, { replace: true });
        }
      }

      if (result.error) throw result.error;

      console.log(`transformer_reports saved/updated successfully. Result:`, result.data);
      setIsEditing(false); // Exit editing mode
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigateAfterSave(navigate, jobId, location);
      
      // Remove or comment out the URL history update since we're navigating away
      // if (!reportId && currentReportId) {
      //   navigate(`/jobs/${jobId}/dry-type-transformer/${currentReportId}`, { replace: true });
      // }
    } catch (error: any) {
      console.error('Error saving transformer report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    }
  };

  useEffect(() => {
    loadJobInfo(); // Load job info regardless
    if (reportId) {
        loadReport(); // Attempt to load if reportId exists
    } else {
        // No reportId, ensure we are in 'new report' state
        setLoading(false);
        setIsEditing(true);
        // Reset specific fields if necessary when creating a new report after viewing an old one
        // setFormData(prev => ({ ...prev, /* reset specific report fields */ }));
    }
  }, [jobId, reportId]); // Rerun if jobId or reportId changes

  useEffect(() => {
    setIsEditing(!reportId);
  }, [reportId]);

  // ... rest of your component logic

  if (loading) {
    return <div>Loading Report Data...</div>;
  }

  // Header render function
  const renderHeader = () => (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex gap-2">
        {/* Pass/Fail Button */}
        <button
          onClick={() => {
            if (isEditing) {
              setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : 'PASS' }))
            }
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            formData.status === 'PASS'
              ? 'bg-green-600 text-white focus:ring-green-500'
              : 'bg-red-600 text-white focus:ring-red-500'
          } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
        >
          {formData.status === 'PASS' ? 'PASS' : 'FAIL'}
        </button>

        {/* Edit/Save/Print Buttons */}
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
            className={`px-4 py-2 text-sm text-white bg-[#f26722] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f26722] ${!isEditing ? 'hidden' : 'hover:bg-[#f26722]/90'}`}
          >
            {reportId ? 'Update Report' : 'Save New Report'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6 relative">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
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
      
      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
        {/* Header */}
        <div className="print:hidden flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (isEditing) {
                  setFormData(prev => ({ ...prev, status: prev.status === 'PASS' ? 'FAIL' : 'PASS' }))
                }
              }}
              disabled={!isEditing}
              className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                formData.status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' :
                'bg-red-600 text-white focus:ring-red-500'
              } ${!isEditing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
            >
              {formData.status}
            </button>

            {reportId && !isEditing ? (
              <>
                <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
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
              <button onClick={handleSave} disabled={!isEditing} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}>
                Save Report
              </button>
            )}
          </div>
        </div>

      {/* Job Information */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-job-info">Job Information</h2>
        

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 print:hidden job-info-onscreen">
            <div><label className="form-label">Customer:</label><input type="text" value={formData.customer} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
            <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
            <div><label htmlFor="technicians" className="form-label">Technicians:</label><input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange(null, 'technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="date" className="form-label">Date:</label><input id="date" type="date" value={formData.date} onChange={(e) => handleChange(null, 'date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="identifier" className="form-label">Identifier:</label><input id="identifier" type="text" value={formData.identifier} onChange={(e) => handleChange(null, 'identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div className="flex items-center space-x-1">
              <div>
                <label htmlFor="temperature.ambient" className="form-label">Temp:</label>
                <input id="temperature.ambient" type="number" value={formData.temperature.ambient} onChange={(e) => handleTemperatureChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-16 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                <span className="ml-1 text-xs">°F</span>
              </div>
              <div>
                <label htmlFor="temperature.celsius" className="form-label sr-only">Celsius</label>
                <input id="temperature.celsius" type="number" value={formData.temperature.celsius} readOnly className="form-input w-16 bg-gray-100 dark:bg-dark-200" />
                <span className="ml-1 text-xs">°C</span>
              </div>
            </div>
            <div><label htmlFor="temperature.correctionFactor" className="form-label">TCF:</label><input id="temperature.correctionFactor" type="number" value={formData.temperature.correctionFactor} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-16" /></div>
            <div><label htmlFor="substation" className="form-label">Substation:</label><input id="substation" type="text" value={formData.substation} onChange={(e) => handleChange(null, 'substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="eqptLocation" className="form-label">Eqpt. Location:</label><input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange(null, 'eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div className="md:col-span-2"><label htmlFor="user" className="form-label">User:</label><input id="user" type="text" value={formData.userName} onChange={(e) => handleChange(null, 'userName', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>

        </div>
        <JobInfoPrintTable
          data={{
            customer: formData.customer,
            address: formData.address,
            jobNumber: formData.jobNumber,
            technicians: formData.technicians,
            date: formData.date,
            identifier: formData.identifier,
            user: formData.userName,
            substation: formData.substation,
            eqptLocation: formData.eqptLocation,
            temperature: {
              fahrenheit: formData.temperature.fahrenheit,
              celsius: formData.temperature.celsius,
              tcf: formData.temperature.correctionFactor,
              humidity: undefined,
            },
          }}
        />
      </div>

      {/* Nameplate Data */}
      <section className="mb-6 nameplate-section">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Nameplate Data</h2>
        <div className="grid grid-cols-3 gap-4 print:hidden nameplate-onscreen">
          {/* Row 1: Manufacturer, Catalog, Serial */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Manufacturer</label>
            <input
              type="text"
              value={formData.nameplateData.manufacturer}
              onChange={(e) => handleNestedChange('nameplateData', 'manufacturer', e.target.value)}
              readOnly={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog Number</label>
            <input
              type="text"
              value={formData.nameplateData.catalogNumber}
              onChange={(e) => handleNestedChange('nameplateData', 'catalogNumber', e.target.value)}
              readOnly={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
            <input
              type="text"
              value={formData.nameplateData.serialNumber}
              onChange={(e) => handleNestedChange('nameplateData', 'serialNumber', e.target.value)}
              readOnly={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 print:hidden nameplate-onscreen">
          {/* Row 2: KVA, Temp Rise, Impedance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">KVA</label>
            <input
              type="text"
              value={formData.nameplateData.kva}
              onChange={(e) => handleNestedChange('nameplateData', 'kva', e.target.value)}
              readOnly={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temp. Rise (°C)</label>
            <input
              type="text"
              value={formData.nameplateData.tempRise}
              onChange={(e) => handleNestedChange('nameplateData', 'tempRise', e.target.value)}
              readOnly={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Impedance (%)</label>
            <input
              type="text"
              value={formData.nameplateData.impedance}
              onChange={(e) => handleNestedChange('nameplateData', 'impedance', e.target.value)}
              readOnly={!isEditing}
              className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
            />
          </div>
        </div>

        <div className="mt-6 print:hidden nameplate-onscreen">
          <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-center">
            <div></div>
            <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">Volts</div>
            <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">Connections</div>
            <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">Winding Material</div>

            {/* Primary Row */}
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Primary</div>
            <div className="flex justify-center items-center space-x-2">
              <input
                type="text"
                value={formData.nameplateData.primary.volts}
                onChange={(e) => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, volts: e.target.value })}
                readOnly={!isEditing}
                className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
              <span className="text-gray-500 dark:text-gray-400">/</span>
              <input
                type="text"
                value={formData.nameplateData.primary.voltsSecondary || ''}
                onChange={(e) => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, voltsSecondary: e.target.value })}
                readOnly={!isEditing}
                className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              />
            </div>
            <div className="flex justify-center space-x-4">
              {['Delta', 'Wye', 'Single Phase'].map(conn => (
                <label key={`pri-${conn}`} className="inline-flex items-center">
                  <input
                    type="radio"
                    name="primary-connection"
                    value={conn}
                    checked={formData.nameplateData.primary.connection === conn}
                    onChange={() => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, connection: conn })}
                    disabled={!isEditing}
                    className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{conn}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-center space-x-4">
              {['Aluminum', 'Copper'].map(mat => (
                <label key={`pri-${mat}`} className="inline-flex items-center">
                  <input
                    type="radio"
                    name="primary-material"
                    value={mat}
                    checked={formData.nameplateData.primary.material === mat}
                    onChange={() => handleNestedChange('nameplateData', 'primary', { ...formData.nameplateData.primary, material: mat })}
                    disabled={!isEditing}
                    className="form-radio h-4 w-4 text-[#f26722] border-gray-300 dark:border-gray-700 focus:ring-[#f26722]"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{mat}</span>
                </label>
              ))}
            </div>

            {/* Secondary Row */}
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Secondary</div>
            <div className="flex justify-center items-center space-x-2">
              <input
                type="text"
                value={formData.nameplateData.secondary.volts}
                onChange={(e) => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, volts: e.target.value })}
                readOnly={!isEditing}
                className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${!isEditing ? 'bg-gray-100' : ''}`}
              />
              <span className="text-gray-500 dark:text-gray-400">/</span>
              <input
                type="text"
                value={formData.nameplateData.secondary.voltsSecondary || ''}
                onChange={(e) => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, voltsSecondary: e.target.value })}
                readOnly={!isEditing}
                className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${!isEditing ? 'bg-gray-100' : ''}`}
              />
            </div>
            <div className="flex justify-center space-x-4">
              {['Delta', 'Wye', 'Single Phase'].map(conn => (
                <label key={`sec-${conn}`} className="inline-flex items-center">
                  <input
                    type="radio"
                    name="secondary-connection"
                    value={conn}
                    checked={formData.nameplateData.secondary.connection === conn}
                    onChange={() => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, connection: conn })}
                    disabled={!isEditing}
                    className="form-radio h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{conn}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-center space-x-4">
              {['Aluminum', 'Copper'].map(mat => (
                <label key={`sec-${mat}`} className="inline-flex items-center">
                  <input
                    type="radio"
                    name="secondary-material"
                    value={mat}
                    checked={formData.nameplateData.secondary.material === mat}
                    onChange={() => handleNestedChange('nameplateData', 'secondary', { ...formData.nameplateData.secondary, material: mat })}
                    disabled={!isEditing}
                    className="form-radio h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{mat}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Tap Configuration */}
        <div className="mt-6 border-t dark:border-gray-700 pt-4 tap-configuration-section print:hidden nameplate-onscreen">
          <h3 className="text-md font-semibold mb-4 text-gray-800 dark:text-white">Tap Configuration</h3>
          <div className="space-y-3">
            <div className="flex items-center">
              <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Voltages</label>
              <div className="grid grid-cols-7 gap-2 flex-1">
                {formData.nameplateData.tapConfiguration.voltages.map((voltage, index) => (
                  <input
                    key={`tap-volt-${index}`}
                    type="text"
                    value={voltage}
                    onChange={(e) => {
                      const newVoltages = [...formData.nameplateData.tapConfiguration.voltages];
                      newVoltages[index] = e.target.value;
                      handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, voltages: newVoltages });
                    }}
                    readOnly={!isEditing}
                    className={`w-full text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                    placeholder={index === 5 || index === 6 ? '-' : ''}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Position</label>
              <div className="grid grid-cols-7 gap-2 flex-1">
                {formData.nameplateData.tapConfiguration.positions.map((position) => (
                  <div key={`tap-pos-${position}`} className="text-center text-sm text-gray-700 dark:text-white font-medium">
                    {position}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">Tap Position Left</label>
              <div className="flex items-center space-x-8">
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={formData.nameplateData.tapConfiguration.currentPosition}
                    onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, currentPosition: parseInt(e.target.value) || 0 })}
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                  <span className="text-gray-500 dark:text-gray-400">/</span>
                  <input
                    type="text"
                    value={formData.nameplateData.tapConfiguration.currentPositionSecondary}
                    onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, currentPositionSecondary: e.target.value })}
                    readOnly={!isEditing}
                    className={`w-16 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Volts</span>
                  <input
                    type="text"
                    value={formData.nameplateData.tapConfiguration.tapVoltsSpecific}
                    onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, tapVoltsSpecific: e.target.value })}
                    readOnly={!isEditing}
                    className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Percent</span>
                  <input
                    type="text"
                    value={formData.nameplateData.tapConfiguration.tapPercentSpecific}
                    onChange={(e) => handleNestedChange('nameplateData', 'tapConfiguration', { ...formData.nameplateData.tapConfiguration, tapPercentSpecific: e.target.value })}
                    readOnly={!isEditing}
                    className={`w-24 text-center rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] text-gray-900 dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
              </div>
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
                  <span className="font-medium">Manufacturer:</span> {formData.nameplateData.manufacturer || ''}
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                  <span className="font-medium">Catalog Number:</span> {formData.nameplateData.catalogNumber || ''}
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                  <span className="font-medium">Serial Number:</span> {formData.nameplateData.serialNumber || ''}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                  <span className="font-medium">KVA:</span> {formData.nameplateData.kva || ''}
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                  <span className="font-medium">Temp. Rise °C:</span> {formData.nameplateData.tempRise || ''}
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                  <span className="font-medium">Impedance:</span> {formData.nameplateData.impedance || ''}
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
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{formData.nameplateData.primary.volts || ''} / {formData.nameplateData.primary.voltsSecondary || ''}</td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.primary.connection === 'Delta' ? '☒' : '☐'} Delta
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.primary.connection === 'Wye' ? '☒' : '☐'} Wye
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.primary.connection === 'Single Phase' ? '☒' : '☐'} Single Phase
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.primary.material === 'Aluminum' ? '☒' : '☐'} Aluminum
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.primary.material === 'Copper' ? '☒' : '☐'} Copper
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Secondary</td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{formData.nameplateData.secondary.volts || ''} / {formData.nameplateData.secondary.voltsSecondary || ''}</td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.secondary.connection === 'Delta' ? '☒' : '☐'} Delta
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.secondary.connection === 'Wye' ? '☒' : '☐'} Wye
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.secondary.connection === 'Single Phase' ? '☒' : '☐'} Single Phase
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.secondary.material === 'Aluminum' ? '☒' : '☐'} Aluminum
                </td>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">
                  {formData.nameplateData.secondary.material === 'Copper' ? '☒' : '☐'} Copper
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
                {formData.nameplateData.tapConfiguration.voltages.map((voltage, index) => (
                  <td key={index} className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white text-center">{voltage || ''}</td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-900 dark:text-white">Tap Position Left</td>
                <td colSpan={7} className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-900 dark:text-white">
                  Position: {formData.nameplateData.tapConfiguration.currentPosition || ''} / {formData.nameplateData.tapConfiguration.currentPositionSecondary || ''} |
                  Volts: {formData.nameplateData.tapConfiguration.tapVoltsSpecific || ''} |
                  Percent: {formData.nameplateData.tapConfiguration.tapPercentSpecific || ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Visual and Mechanical Inspection */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-visual-mechanical">Visual and Mechanical Inspection</h2>
                    <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 visual-mechanical-table table-fixed">
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '70%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">NETA Section</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Result</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                                {formData.visualInspectionItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{item.id}</td>
                  <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-normal break-words">{item.description}</td>
                  <td className="px-3 py-2">
                    <div className="print:hidden">
                        <select
                          value={item.result}
                          onChange={(e) => handleVisualInspectionChange(index, 'result', e.target.value)}
                          disabled={!isEditing}
                          className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        >
                          {visualInspectionOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                                            </select>
                    </div>
                    <div className="hidden print:block text-center">{item.result}</div>
                  </td>
                </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

      {/* Insulation Resistance Tests */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-insulation-resistance">Electrical Tests - Insulation Resistance</h2>
            <div className="space-y-6">
              {/* Flex container for side-by-side tables */}
              <div className="flex flex-wrap gap-6">
                {/* Insulation Resistance Values Table */}
                            <div className="overflow-x-auto flex-1 min-w-[400px]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th colSpan={6} className="px-6 py-3 text-center text-sm font-medium text-gray-700 dark:text-white">Insulation Resistance Values</th>
                  </tr>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Winding Under Test</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Test Voltage</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">0.5 Min.</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">1 Min.</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">10 Min.</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                      {[
                        { id: 'primaryToGround', label: 'Primary to Ground', defaultVoltage: '5000V' },
                        { id: 'secondaryToGround', label: 'Secondary to Ground', defaultVoltage: '1000V' },
                        { id: 'primaryToSecondary', label: 'Primary to Secondary', defaultVoltage: '5000V' }
                                        ].map((test) => (
                    <tr key={test.id}>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{test.label}</td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                            <select
                              value={formData.insulationResistance[test.id].testVoltage}
                              onChange={(e) => handleNestedChange('insulationResistance', test.id, {
                                ...formData.insulationResistance[test.id],
                                testVoltage: e.target.value
                              })}
                              disabled={!isEditing}
                              className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            >
                              {testVoltageOptions.map(voltage => (
                                <option key={voltage} value={voltage} className="dark:bg-dark-100 dark:text-white">{voltage}</option>
                              ))}
                                                    </select>
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].testVoltage}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <input
                          type="text"
                          value={formData.insulationResistance[test.id].readings.halfMinute}
                          onChange={(e) => handleDeepNestedChange('insulationResistance', test.id, 'readings', 'halfMinute', e.target.value)}
                          readOnly={!isEditing}
                          className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        />
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].readings.halfMinute}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <input
                          type="text"
                          value={formData.insulationResistance[test.id].readings.oneMinute}
                          onChange={(e) => handleDeepNestedChange('insulationResistance', test.id, 'readings', 'oneMinute', e.target.value)}
                          readOnly={!isEditing}
                          className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        />
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].readings.oneMinute}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <input
                          type="text"
                          value={formData.insulationResistance[test.id].readings.tenMinute}
                          onChange={(e) => handleDeepNestedChange('insulationResistance', test.id, 'readings', 'tenMinute', e.target.value)}
                          readOnly={!isEditing}
                          className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        />
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].readings.tenMinute}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <select
                          value={formData.insulationResistance[test.id].unit}
                          onChange={(e) => handleNestedChange('insulationResistance', test.id, {
                            ...formData.insulationResistance[test.id],
                            unit: e.target.value
                          })}
                          disabled={!isEditing}
                          className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                        >
                          {insulationResistanceUnits.map(unit => (
                            <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
                          ))}
                        </select>
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].unit}</div>
                      </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Temperature Corrected Values Table */}
                            <div className="overflow-x-auto flex-1 min-w-[300px]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th colSpan={4} className="px-6 py-3 text-center text-sm font-medium text-gray-700 dark:text-white">Temperature Corrected Values</th>
                  </tr>
                  <tr>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">0.5 Min.</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">1 Min.</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">10 Min.</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                      {[
                        { id: 'primaryToGround' },
                        { id: 'secondaryToGround' },
                        { id: 'primaryToSecondary' }
                                        ].map((test) => (
                    <tr key={test.id}>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <input
                          type="text"
                          value={formData.insulationResistance[test.id].corrected.halfMinute}
                          readOnly
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                        />
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].corrected.halfMinute}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <input
                          type="text"
                          value={formData.insulationResistance[test.id].corrected.oneMinute}
                          readOnly
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                        />
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].corrected.oneMinute}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <input
                          type="text"
                          value={formData.insulationResistance[test.id].corrected.tenMinute}
                          readOnly
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                        />
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].corrected.tenMinute}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="print:hidden">
                        <input
                          type="text"
                          value={formData.insulationResistance[test.id].unit}
                          readOnly
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                        />
                        </div>
                        <div className="hidden print:block text-center">{formData.insulationResistance[test.id].unit}</div>
                      </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dielectric Absorption and Polarization Index */}
                        <div className="overflow-x-auto mt-6">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-dark-200">
                <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"></th>
                   <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-32">Primary</th>
                   <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-32">Secondary</th>
                   <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-32">Primary to Secondary</th>
                   <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-32">Acceptable</th>
                </tr>
               </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                                    <tr>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">Dielectric Absorption : (Ratio of 1 Minute to 0.5 Minute Result)</td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.primaryToGround.dielectricAbsorption}
                      readOnly
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.secondaryToGround.dielectricAbsorption}
                      readOnly
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.primaryToSecondary.dielectricAbsorption}
                      readOnly
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.dielectricAbsorptionAcceptable}
                      readOnly
                      className={`form-input w-full bg-gray-100 dark:bg-dark-200 ${
                        formData.insulationResistance.dielectricAbsorptionAcceptable === 'Yes' ? 'text-green-600 font-medium' :
                        formData.insulationResistance.dielectricAbsorptionAcceptable === 'No' ? 'text-red-600 font-medium' : ''
                      }`}
                    />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">Polarization Index : (Ratio of 10 Minute to 1 Minute Result)</td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.primaryToGround.polarizationIndex}
                      readOnly
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.secondaryToGround.polarizationIndex}
                      readOnly
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.primaryToSecondary.polarizationIndex}
                      readOnly
                      className="form-input w-full bg-gray-100 dark:bg-dark-200"
                    />
                  </td>
                  <td className="px-6 py-4 w-32">
                    <input
                      type="text"
                      value={formData.insulationResistance.polarizationIndexAcceptable}
                      readOnly
                      className={`form-input w-full bg-gray-100 dark:bg-dark-200 ${
                        formData.insulationResistance.polarizationIndexAcceptable === 'Yes' ? 'text-green-600 font-medium' :
                        formData.insulationResistance.polarizationIndexAcceptable === 'No' ? 'text-red-600 font-medium' : ''
                      }`}
                    />
                  </td>
                </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

      {/* Test Equipment Used */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-test-equipment">Test Equipment Used</h2>
            <div className="grid grid-cols-1 gap-6 print:hidden test-eqpt-onscreen">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Megohmmeter</label>
                  <input
                    type="text"
                    value={formData.testEquipment.megohmmeter.name}
                    onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', {
                      ...formData.testEquipment.megohmmeter,
                      name: e.target.value
                    })}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</label>
                  <input
                    type="text"
                    value={formData.testEquipment.megohmmeter.serialNumber}
                    onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', {
                      ...formData.testEquipment.megohmmeter,
                      serialNumber: e.target.value
                    })}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">AMP ID</label>
                  <input
                    type="text"
                    value={formData.testEquipment.megohmmeter.ampId}
                    onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', {
                      ...formData.testEquipment.megohmmeter,
                      ampId: e.target.value
                    })}
                    readOnly={!isEditing}
                    className={`mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 shadow-sm dark:text-white ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                  />
                </div>
              </div>
            </div>
            
            {/* Print-only compact Test Equipment table */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black">
                <colgroup>
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black">
                      <div className="font-semibold">Megohmmeter:</div>
                      <div className="mt-0">{formData.testEquipment.megohmmeter.name || ''}</div>
                    </td>
                    <td className="p-2 align-top border border-gray-300 print:border-black">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">{formData.testEquipment.megohmmeter.serialNumber || ''}</div>
                    </td>
                    <td className="p-2 align-top border border-gray-300 print:border-black">
                      <div className="font-semibold">AMP ID:</div>
                      <div className="mt-0">{formData.testEquipment.megohmmeter.ampId || ''}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

      {/* Comments */}
      <div className="mb-6">
        <div className="w-full h-1 bg-[#f26722] mb-4"></div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-comments">Comments</h2>
        <textarea
          value={formData.comments}
          onChange={(e) => handleChange(null, 'comments', e.target.value)}
          readOnly={!isEditing}
          rows={1}
          className={`form-textarea w-full resize-none ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''} print:hidden`}
          placeholder="Enter comments here..."
        />
        {/* Print-only comments box */}
        <div className="hidden print:block">
          <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black">
            <tbody>
              <tr>
                <td className="p-2 align-top border border-gray-300 print:border-black">
                  <div className="font-semibold">Comments</div>
                  <div className="mt-0">{formData.comments || ''}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
      body { margin: 0; padding: 20px; font-family: Arial, Helvetica, sans-serif !important; }
      html, body { font-size: 9px !important; color: black !important; background: white !important; line-height: 1 !important; }
      
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
      
      /* Remove non-table borders to avoid conflicts and ensure crisp table lines */
      * { border: none !important; box-shadow: none !important; outline: none !important; }
      table { border-collapse: collapse !important; width: 100% !important; margin: 1px 0 !important; font-size: 8px !important; }
      thead { display: table-header-group !important; }
      tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      table, th, td, thead, tbody, tr { border: 1px solid black !important; }
      th, td { padding: 2px 3px !important; text-align: center !important; font-size: 8px !important; height: 12px !important; line-height: 1 !important; }
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

      /* Visual & Mechanical table widths for readability - matching PanelboardReport */
      table.visual-mechanical-table { table-layout: fixed !important; width: 100% !important; border-collapse: collapse !important; }
      table.visual-mechanical-table thead { display: table-header-group !important; }
      table.visual-mechanical-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      table.visual-mechanical-table th, table.visual-mechanical-table td { font-size: 8px !important; padding: 2px 3px !important; vertical-align: middle !important; }
      table.visual-mechanical-table colgroup col:nth-child(1) { width: 6% !important; }
      table.visual-mechanical-table colgroup col:nth-child(2) { width: 70% !important; }
      table.visual-mechanical-table colgroup col:nth-child(3) { width: 24% !important; }
      table.visual-mechanical-table td:nth-child(2) { white-space: normal !important; word-break: break-word !important; }

      /* Insulation Resistance tables */
      .section-insulation-resistance table { table-layout: fixed !important; width: 100% !important; }
      .section-insulation-resistance th, .section-insulation-resistance td { padding: 2px 3px !important; font-size: 8px !important; }
      
      /* Compact table cells for all sections */
      .section-visual-mechanical th, .section-visual-mechanical td,
      .section-insulation-resistance th, .section-insulation-resistance td,
      .section-test-equipment th, .section-test-equipment td { padding: 2px 3px !important; font-size: 8px !important; }
      
      /* Ensure test equipment on-screen form is hidden in print */
      .test-eqpt-onscreen { display: none !important; }
      
      /* Prevent comments from breaking across pages */
      .section-comments { break-inside: avoid !important; page-break-inside: avoid !important; }
      .section-comments textarea { min-height: 120px !important; height: auto !important; }

      /* Hide on-screen elements in print */
      .nameplate-onscreen,
      .nameplate-onscreen * {
        display: none !important;
      }

      /* Ensure print-only elements are visible */
      .hidden.print\\:block {
        display: block !important;
      }

      /* Enforce table layouts for specific tables */
      table:has(colgroup col[style*="33.33%"]) {
        table-layout: fixed !important;
        width: 100% !important;
      }

      table:has(colgroup col[style*="12%"]) {
        table-layout: fixed !important;
        width: 100% !important;
      }

      table:has(colgroup col[style*="33.33%"]) th,
      table:has(colgroup col[style*="33.33%"]) td {
        width: 33.33% !important;
        min-width: 33.33% !important;
        max-width: 33.33% !important;
      }

      table:has(colgroup col[style*="12%"]) th,
      table:has(colgroup col[style*="12%"]) td {
        width: auto !important;
        min-width: auto !important;
        max-width: auto !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(1),
      table:has(colgroup col[style*="12%"]) td:nth-child(1) {
        width: 12% !important;
        min-width: 12% !important;
        max-width: 12% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(2),
      table:has(colgroup col[style*="12%"]) td:nth-child(2) {
        width: 18% !important;
        min-width: 18% !important;
        max-width: 18% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(3),
      table:has(colgroup col[style*="12%"]) td:nth-child(3) {
        width: 16% !important;
        min-width: 16% !important;
        max-width: 16% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(4),
      table:has(colgroup col[style*="12%"]) td:nth-child(4) {
        width: 16% !important;
        min-width: 16% !important;
        max-width: 16% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(5),
      table:has(colgroup col[style*="12%"]) td:nth-child(5) {
        width: 16% !important;
        min-width: 16% !important;
        max-width: 16% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(6),
      table:has(colgroup col[style*="12%"]) td:nth-child(6) {
        width: 9% !important;
        min-width: 9% !important;
        max-width: 9% !important;
      }

      table:has(colgroup col[style*="12%"]) th:nth-child(7),
      table:has(colgroup col[style*="12%"]) td:nth-child(7) {
        width: 9% !important;
        min-width: 9% !important;
        max-width: 9% !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default DryTypeTransformerReport; 