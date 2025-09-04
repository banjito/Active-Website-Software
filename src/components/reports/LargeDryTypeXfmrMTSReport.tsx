import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { navigateAfterSave } from './ReportUtils';
import _ from 'lodash';
import { getReportName, getAssetName } from './reportMappings';
import { ReportWrapper } from './ReportWrapper';
import JobInfoPrintTable from './common/JobInfoPrintTable';

// Add type definitions for error handling
type SupabaseError = {
    message: string;
    code?: string;
};

// Define table name constant
const LARGE_DRY_TYPE_XFMR_MTS_TABLE = 'large_dry_type_transformer_mts_reports' as const;

// Temperature conversion and TCF tables (same as DryTypeTransformer)
const tempConvTable = [
  [-11.2, -24], [-9.4, -23], [-7.6, -22], [-5.8, -21], [-4, -20], [-2.2, -19], [1.4, -17], [3.2, -16], [5, -15], [6.8, -14], [8.6, -13], [10.4, -12], [12.2, -11], [14, -10], [15.8, -9], [17.6, -8], [19.4, -7], [21.2, -6], [23, -5], [24.8, -4], [26.6, -3], [28.4, -2], [30.2, -1], [32, 0], [33.8, 1], [35.6, 2], [37.4, 3], [39.2, 4], [41, 5], [42.8, 6], [44.6, 7], [46.4, 8], [48.2, 9], [50, 10], [51.8, 11], [53.6, 12], [55.4, 13], [57.2, 14], [59, 15], [60.8, 16], [62.6, 17], [64.4, 18], [66.2, 19], [68, 20], [70, 21], [72, 22], [73.4, 23], [75.2, 24], [77, 25], [78.8, 26], [80.6, 27], [82.4, 28], [84.2, 29], [86, 30], [87.8, 31], [89.6, 32], [91.4, 33], [93.2, 34], [95, 35], [96.8, 36], [98.6, 37], [100.4, 38], [102.2, 39], [104, 40], [105.8, 41], [107.6, 42], [109.4, 43], [111.2, 44], [113, 45], [114.8, 46], [116.6, 47], [118.4, 48], [120.2, 49], [122, 50], [123.8, 51], [125.6, 52], [127.4, 53], [129.2, 54], [131, 55], [132.8, 56], [134.6, 57], [136.4, 58], [138.2, 59], [140, 60], [141.8, 61], [143.6, 62], [145.4, 63], [147.2, 64], [149, 65]
];

const tcfTable = [
  [-24, 0.054], [-23, 0.068], [-22, 0.082], [-21, 0.096], [-20, 0.11], [-19, 0.124], [-18, 0.138], [-17, 0.152], [-16, 0.166], [-15, 0.18], [-14, 0.194], [-13, 0.208], [-12, 0.222], [-11, 0.236], [-10, 0.25], [-9, 0.264], [-8, 0.278], [-7, 0.292], [-6, 0.306], [-5, 0.32], [-4, 0.336], [-3, 0.352], [-2, 0.368], [-1, 0.384], [0, 0.4], [1, 0.42], [2, 0.44], [3, 0.46], [4, 0.48], [5, 0.5], [6, 0.526], [7, 0.552], [8, 0.578], [9, 0.604], [10, 0.63], [11, 0.666], [12, 0.702], [13, 0.738], [14, 0.774], [15, 0.81], [16, 0.848], [17, 0.886], [18, 0.924], [19, 0.962], [20, 1], [21, 1.05], [22, 1.1], [23, 1.15], [24, 1.2], [25, 1.25], [26, 1.316], [27, 1.382], [28, 1.448], [29, 1.514], [30, 1.58], [31, 1.664], [32, 1.748], [33, 1.832], [34, 1.872], [35, 2], [36, 2.1], [37, 2.2], [38, 2.3], [39, 2.4], [40, 2.5], [41, 2.628], [42, 2.756], [43, 2.884], [44, 3.012], [45, 3.15], [46, 3.316], [47, 3.482], [48, 3.648], [49, 3.814], [50, 3.98], [51, 4.184], [52, 4.388], [53, 4.592], [54, 4.796], [55, 5], [56, 5.26], [57, 5.52], [58, 5.78], [59, 6.04], [60, 6.3], [61, 6.62], [62, 6.94], [63, 7.26], [64, 7.58], [65, 7.9], [66, 8.32], [67, 8.74], [68, 9.16], [69, 9.58], [70, 10], [71, 10.52], [72, 11.04], [73, 11.56], [74, 12.08], [75, 12.6], [76, 13.24], [77, 13.88], [78, 14.52], [79, 15.16], [80, 15.8], [81, 16.64], [82, 17.48], [83, 18.32], [84, 19.16], [85, 20], [86, 21.04], [87, 22.08], [88, 23.12], [89, 24.16], [90, 25.2], [91, 26.45], [92, 27.7], [93, 28.95], [94, 30.2], [95, 31.6], [96, 33.28], [97, 34.96], [98, 36.64], [99, 38.32], [100, 40], [101, 42.08], [102, 44.16], [103, 46.24], [104, 48.32], [105, 50.4], [106, 52.96], [107, 55.52], [108, 58.08], [109, 60.64], [110, 63.2]
];

// Dropdown options
const visualInspectionOptions = [ // As per screenshot
  "Select One", "Yes", "No", "N/A", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments",
];

const insulationResistanceUnits = [
  { symbol: "kΩ"},
  { symbol: "MΩ"},
  { symbol: "GΩ"}
];

const testVoltageOptions = [
  "250V", "500V", "1000V",
  "2500V", "5000V", "10000V"
];

// Interface for form data structure
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
    humidity?: number; // Make humidity optional as it's not always present
  };

  // Nameplate Data
  nameplateData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    kva: string;
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
  visualInspection: {
    [key: string]: string | undefined; // Allow for string results and optional comments
  };

  // Insulation Resistance
  insulationResistance: {
    temperature: string; 
    primaryToGround: {
      testVoltage: string;
      unit: string;
      readings: { halfMinute: string; oneMinute: string; tenMinute: string; };
      corrected: { halfMinute: string; oneMinute: string; tenMinute: string; };
      dielectricAbsorption: string; polarizationIndex: string;
    };
    secondaryToGround: {
      testVoltage: string;
      unit: string;
      readings: { halfMinute: string; oneMinute: string; tenMinute: string; };
      corrected: { halfMinute: string; oneMinute: string; tenMinute: string; };
      dielectricAbsorption: string; polarizationIndex: string;
    };
    primaryToSecondary: {
      testVoltage: string;
      unit: string;
      readings: { halfMinute: string; oneMinute: string; tenMinute: string; };
      corrected: { halfMinute: string; oneMinute: string; tenMinute: string; };
      dielectricAbsorption: string; polarizationIndex: string;
    };
    dielectricAbsorptionAcceptable: string;
    polarizationIndexAcceptable: string;
  };

  // Test Equipment
  testEquipment: {
    megohmmeter: { name: string; serialNumber: string; ampId: string; };
  };

  // Comments
  comments: string;
  status: string;
}

// Helper function to calculate corrected value
const calculateCorrectedValue = (readingStr: string, tcf: number): string => {
   if (typeof readingStr === 'string' && (readingStr.includes('>') || readingStr.includes('<'))) {
      return readingStr;
   }
  const readingNum = parseFloat(readingStr);
  if (isNaN(readingNum) || !isFinite(readingNum)) return '';
  return (readingNum * tcf).toFixed(2);
};

// Helper function to calculate DA/PI ratio
const calculateDAPRatio = (numeratorStr: string, denominatorStr: string): string => {
   if (typeof numeratorStr === 'string' && (numeratorStr.includes('>') || numeratorStr.includes('<'))) return '';
   if (typeof denominatorStr === 'string' && (denominatorStr.includes('>') || denominatorStr.includes('<'))) return '';
   const numerator = parseFloat(numeratorStr);
   const denominator = parseFloat(denominatorStr);
   if (isNaN(numerator) || isNaN(denominator) || !isFinite(numerator) || !isFinite(denominator) || denominator === 0) return '';
   return (numerator / denominator).toFixed(2);
};

// Helper function to calculate TCF
const calculateTCF = (celsius: number): number => {
  // Find exact match first
  const exactMatch = tcfTable.find(([temp]) => temp === celsius);
  if (exactMatch) return exactMatch[1];

  // If no exact match, find closest temperature value
  const closestTemp = tcfTable.reduce((prev, curr) => {
    return Math.abs(curr[0] - celsius) < Math.abs(prev[0] - celsius) ? curr : prev;
  });

  return closestTemp[1];
};

const visualInspectionItemsConfig = [
  { id: '7.2.1.2.A.1', description: "Inspect physical and mechanical condition." },
  { id: '7.2.1.2.A.2', description: "Inspect anchorage, alignment, and grounding." },
  { id: '7.2.1.2.A.3*', description: "Prior to cleaning the unit, perform as-found tests." },
  { id: '7.2.1.2.A.4', description: "Clean the unit." },
  { id: '7.2.1.2.A.5*', description: "Verify that control and alarm settings on temperature indicators are as specified." },
  { id: '7.2.1.2.A.6', description: "Verify that cooling fans operate correctly." },
  { id: '7.2.1.2.A.7', description: "Inspect bolted electrical connections for high resistance using a low-resistance ohmmeter." },
  { id: '7.2.1.2.A.8', description: "Perform specific inspections and mechanical tests as recommended by the manufacturer." },
  { id: '7.2.1.2.A.9', description: "Perform as-left tests." },
  { id: '7.2.1.2.A.10', description: "Verify that as-left tap connections are as specified." },
  { id: '7.2.1.2.A.11', description: "Verify the presence of surge arresters." },
];


const LargeDryTypeXfmrMTSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId?: string }>();
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
  const reportSlug = 'large-dry-type-xfmr-mts-report'; // This component handles the large-dry-type-xfmr-mts-report route
  const reportName = getReportName(reportSlug);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');
  const [error, setError] = useState<string | null>(null); // Error state

  const [formData, setFormData] = useState<FormData>(() => {
    const initialVisualInspection: { [key: string]: string } = {};
    visualInspectionItemsConfig.forEach(item => {
      initialVisualInspection[`${item.id}_result`] = 'Select One'; // Default for dropdown
      initialVisualInspection[`${item.id}_comment`] = '';       // Default for comment
    });

    return {
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
        ambient: 68, 
        celsius: 20,
        fahrenheit: 68,
        correctionFactor: 1, 
        humidity: 50, 
      },
      nameplateData: {
        manufacturer: '', catalogNumber: '', serialNumber: '', kva: '', tempRise: '', impedance: '',
        primary: { volts: '', voltsSecondary: '', connection: '', material: '' },
        secondary: { volts: '', voltsSecondary: '', connection: '', material: '' },
        tapConfiguration: {
          positions: Array.from({ length: 7 }, (_, i) => i + 1), // Default 7 positions
          voltages: Array(7).fill(''),
          currentPosition: 1, // Default to position 1
          currentPositionSecondary: '',
          tapVoltsSpecific: '',
          tapPercentSpecific: '',
        },
      },
      visualInspection: initialVisualInspection,
      insulationResistance: {
        temperature: '20', // Default to 20C
        primaryToGround: { testVoltage: '1000V', unit: 'GΩ', readings: { halfMinute: '', oneMinute: '', tenMinute: '' }, corrected: { halfMinute: '', oneMinute: '', tenMinute: '' }, dielectricAbsorption: '', polarizationIndex: '' },
        secondaryToGround: { testVoltage: '1000V', unit: 'GΩ', readings: { halfMinute: '', oneMinute: '', tenMinute: '' }, corrected: { halfMinute: '', oneMinute: '', tenMinute: '' }, dielectricAbsorption: '', polarizationIndex: '' },
        primaryToSecondary: { testVoltage: '1000V', unit: 'GΩ', readings: { halfMinute: '', oneMinute: '', tenMinute: '' }, corrected: { halfMinute: '', oneMinute: '', tenMinute: '' }, dielectricAbsorption: '', polarizationIndex: '' },
        dielectricAbsorptionAcceptable: 'N/A',
        polarizationIndexAcceptable: 'N/A',
      },
      testEquipment: {
        megohmmeter: { name: '', serialNumber: '', ampId: '' },
      },
      comments: '',
      status: 'PASS',
    };
  });
  const getVisualInspectionDescription = (id: string): string => {
    const item = visualInspectionItemsConfig.find(item => item.id === id);
    return item ? item.description : 'Unknown Inspection Item';
  };
  const handleTemperatureChange = (fahrenheit: number) => {
    const celsius = parseFloat(((fahrenheit - 32) * 5 / 9).toFixed(1));
    const roundedCelsius = Math.round(celsius); // Round to nearest integer for TCF lookup
    const correctionFactor = calculateTCF(roundedCelsius);
    
    setFormData(prev => ({
      ...prev,
      temperature: { 
        ...prev.temperature, 
        fahrenheit, 
        celsius, 
        correctionFactor 
      }
    }));
  };

   const handleChange = (section: keyof FormData | null, field: string, value: any) => {
    setFormData(prev => {
      if (section) {
        return { ...prev, [section]: { ...(prev[section] as any), [field]: value } };
      }
      return { ...prev, [field]: value };
    });
  };

   const handleNestedChange = (section: keyof FormData, subsection: string, value: any) => {
       setFormData(prev => ({
           ...prev,
           [section]: { ...(prev[section] as any), [subsection]: value }
       }));
   };

   const handleDeepNestedChange = (section: keyof FormData, subsection: string, nestedSection: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as any),
        [subsection]: {
          ...((prev[section] as any)[subsection] as any),
          [nestedSection]: { ...((prev[section]as any)[subsection][nestedSection] as any), [field]:value}
        }
      }
    }));
  };

    const handleVisualInspectionChange = (id: string, type: 'result' | 'comment', value: string) => {
    setFormData(prev => ({
      ...prev,
      visualInspection: {
        ...prev.visualInspection,
        [`${id}_${type}`]: value,
      }
    }));
  };

      const updateCalculatedValues = (testId: keyof FormData['insulationResistance']) => {
         if (testId === "temperature" || testId === "dielectricAbsorptionAcceptable" || testId === "polarizationIndexAcceptable" ) return;
        setFormData(prev => {
            const testData = prev.insulationResistance[testId] as typeof prev.insulationResistance.primaryToGround; // Type assertion
            if (!testData || !testData.readings) return prev; // Guard against undefined

            const tcf = prev.temperature.correctionFactor;
            const correctedHalfMinute = calculateCorrectedValue(testData.readings.halfMinute, tcf);
            const correctedOneMinute = calculateCorrectedValue(testData.readings.oneMinute, tcf);
            const correctedTenMinute = calculateCorrectedValue(testData.readings.tenMinute, tcf);
            const dielectricAbsorption = calculateDAPRatio(correctedOneMinute, correctedHalfMinute);
            const polarizationIndex = calculateDAPRatio(correctedTenMinute, correctedOneMinute);

            return {
                ...prev,
                insulationResistance: {
                    ...prev.insulationResistance,
                    [testId]: {
                        ...testData,
                        corrected: {
                            halfMinute: correctedHalfMinute,
                            oneMinute: correctedOneMinute,
                            tenMinute: correctedTenMinute,
                        },
                        dielectricAbsorption,
                        polarizationIndex,
                    }
                }
            };
        });
    };


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
      if (jobData) {
        setFormData(prev => ({
          ...prev,
          jobNumber: jobData.job_number || '',
          customer: jobData.customer_id || '', // Will be replaced by customer name
        }));

        if (jobData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', jobData.customer_id)
            .single();

          if (customerError) throw customerError;
          if (customerData) {
            setFormData(prev => ({
              ...prev,
              customer: customerData.company_name || customerData.name || '',
              address: customerData.address || '',
            }));
          }
        }
      }
    } catch (err) {
      console.error("Error loading job info:", err);
      const supabaseErr = err as SupabaseError;
      setError(`Failed to load job info: ${supabaseErr.message}`);
    }
  };

  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .schema('neta_ops')
        .from(LARGE_DRY_TYPE_XFMR_MTS_TABLE)
        .select('*')
        .eq('id', reportId)
        .single();

      if (fetchError) throw fetchError;
      if (data) {
        // Load data from individual columns instead of report_data
        const loadedVisualInspection = data.visual_inspection || {};
        const initialVisualInspectionState: { [key: string]: string } = {};
        visualInspectionItemsConfig.forEach(item => {
          initialVisualInspectionState[`${item.id}_result`] = loadedVisualInspection[`${item.id}_result`] || 'Select One';
          initialVisualInspectionState[`${item.id}_comment`] = loadedVisualInspection[`${item.id}_comment`] || '';
        });
        
        setFormData(prev => ({
          ...prev,
          // Load from individual columns
          customer: data.report_info?.customer || '',
          address: data.report_info?.address || '',
          date: data.report_info?.date || '',
          technicians: data.report_info?.technicians || '',
          jobNumber: data.report_info?.jobNumber || '',
          substation: data.report_info?.substation || '',
          eqptLocation: data.report_info?.eqptLocation || '',
          identifier: data.report_info?.identifier || '',
          userName: data.report_info?.userName || '',
          visualInspection: initialVisualInspectionState,
          status: data.report_info?.status || 'PASS',
          // Ensure temperature object and its fields are correctly populated
          temperature: {
            ...prev.temperature,
            ...(data.report_info?.temperature || {}),
            // Recalculate celsius and correctionFactor if fahrenheit is present
            ...(data.report_info?.temperature?.fahrenheit !== undefined && {
              celsius: parseFloat(((data.report_info.temperature.fahrenheit - 32) * 5 / 9).toFixed(1)),
              correctionFactor: calculateTCF(Math.round(parseFloat(((data.report_info.temperature.fahrenheit - 32) * 5 / 9).toFixed(1))))
            })
          },
          // Ensure all nested objects are properly populated
          nameplateData: {
            ...prev.nameplateData,
            ...(data.report_info?.nameplateData || {})
          },
          insulationResistance: {
            ...prev.insulationResistance,
            ...(data.insulation_resistance || {})
          },
          testEquipment: {
            ...prev.testEquipment,
            ...(data.test_equipment || {})
          },
          comments: data.comments || ''
        }));
        setStatus(data.report_info?.status || 'PASS');
        setIsEditing(false);
      }
    } catch (err) {
      console.error("Error loading report:", err);
      const supabaseErr = err as SupabaseError;
      setError(`Failed to load report: ${supabaseErr.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save report
  const handleSave = async () => {
      if (!jobId || !user?.id || !isEditing) {
          console.warn("Save condition not met:", { jobId, userId: user?.id, isEditing });
          return;
      }

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
               isLargeType: true,
               isMTS: true,
               reportType: 'large_dry_type_xfmr_mts'
           },
           visual_inspection: formData.visualInspection,
           insulation_resistance: formData.insulationResistance,
           turns_ratio: {},
           test_equipment: formData.testEquipment,
           comments: formData.comments
       };

       console.log('Saving report data:', reportData);

       try {
           setLoading(true);
           let result;
           let currentReportId = reportId;

           if (currentReportId) {
               // Update existing report
               result = await supabase
                   .schema('neta_ops')
                   .from('large_dry_type_transformer_mts_reports')
                   .update(reportData)
                   .eq('id', currentReportId)
                   .select()
                   .single();
           } else {
               // Create new report
               result = await supabase
                   .schema('neta_ops')
                   .from('large_dry_type_transformer_mts_reports')
                   .insert(reportData)
                   .select()
                   .single();

               if (result.data?.id) {
                   currentReportId = result.data.id;
                   console.log(`New report created with ID: ${currentReportId}`);

                   // Create corresponding asset entry
                   const assetName = `Large Dry Type Transformer MTS - ${formData.identifier || formData.eqptLocation || 'Unnamed'}`;
                   const assetUrl = `report:/jobs/${jobId}/large-dry-type-xfmr-mts-report/${currentReportId}?returnToAssets=true`;

                   const assetData = {
                       name: assetName,
                       file_url: assetUrl,
                       user_id: user.id,
                       template_type: 'large_dry_type_xfmr_mts'
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
               }
           }

           if (result.error) throw result.error;

           setIsEditing(false);
           alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
           navigateAfterSave(navigate, jobId, location);

       } catch (error) {
           const err = error as SupabaseError;
           console.error('Error saving report:', err);
           alert(`Failed to save report: ${err.message}`);
       } finally {
           setLoading(false);
       }
   };

  useEffect(() => { const fetchData = async () => { await loadJobInfo(); await loadReport(); }; fetchData(); }, [jobId, reportId]);
  
  // Effect to re-calculate corrected values when temperature or readings change
   useEffect(() => {
    const tcf = formData.temperature.correctionFactor;
    const updateCalculatedValues = (testId: keyof FormData['insulationResistance']) => {
      if (testId === "temperature" || testId === "dielectricAbsorptionAcceptable" || testId === "polarizationIndexAcceptable") return;
      
      setFormData(prev => {
        const testData = prev.insulationResistance[testId] as typeof prev.insulationResistance.primaryToGround;
        if (!testData || !testData.readings) return prev;

        const correctedHalfMinute = calculateCorrectedValue(testData.readings.halfMinute, tcf);
        const correctedOneMinute = calculateCorrectedValue(testData.readings.oneMinute, tcf);
        const correctedTenMinute = calculateCorrectedValue(testData.readings.tenMinute, tcf);
        
        // Use corrected values for DA/PI calculations as per NETA standard
        const dielectricAbsorption = calculateDAPRatio(correctedOneMinute, correctedHalfMinute);
        const polarizationIndex = calculateDAPRatio(correctedTenMinute, correctedOneMinute);

        // Calculate Acceptable values
        const daValues = [
          prev.insulationResistance.primaryToGround?.dielectricAbsorption,
          prev.insulationResistance.secondaryToGround?.dielectricAbsorption,
          prev.insulationResistance.primaryToSecondary?.dielectricAbsorption
        ].map(v => parseFloat(v));
        const daAcceptable = daValues.some(v => !isNaN(v)) && daValues.every(v => isNaN(v) || v > 1.0) ? 'Yes' : 'No';

        const piValues = [
          prev.insulationResistance.primaryToGround?.polarizationIndex,
          prev.insulationResistance.secondaryToGround?.polarizationIndex,
          prev.insulationResistance.primaryToSecondary?.polarizationIndex
        ].map(v => parseFloat(v));
        const piAcceptable = piValues.some(v => !isNaN(v)) && piValues.every(v => isNaN(v) || v > 1.0) ? 'Yes' : 'No';

        return {
          ...prev,
          insulationResistance: {
            ...prev.insulationResistance,
            [testId]: {
              ...testData,
              corrected: {
                halfMinute: correctedHalfMinute,
                oneMinute: correctedOneMinute,
                tenMinute: correctedTenMinute,
              },
              dielectricAbsorption,
              polarizationIndex,
            },
            dielectricAbsorptionAcceptable: daAcceptable,
            polarizationIndexAcceptable: piAcceptable
          }
        };
      });
    };

    if (formData.insulationResistance) {
      updateCalculatedValues('primaryToGround');
      updateCalculatedValues('secondaryToGround');
      updateCalculatedValues('primaryToSecondary');
    }
  }, [formData.insulationResistance?.primaryToGround?.readings, formData.insulationResistance?.secondaryToGround?.readings, formData.insulationResistance?.primaryToSecondary?.readings, formData.temperature.correctionFactor]);


  const renderHeader = () => (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => { if (isEditing) setStatus(status === 'PASS' ? 'FAIL' : 'PASS'); }}
          className={`px-4 py-2 rounded-md text-white font-medium transition-colors
                        ${status === 'PASS' ? 'bg-green-600' : 'bg-red-600'}
                        ${isEditing ? (status === 'PASS' ? 'hover:bg-green-700' : 'hover:bg-red-700') : 'opacity-70 cursor-not-allowed'}`}
          disabled={!isEditing}
        >
          {status}
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
            className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700 disabled:opacity-50'}`}
          >
            {loading ? 'Saving...' : (reportId ? 'Update Report' : 'Save Report')}
          </button>
        )}
      </div>
    </div>
  );

  if (loading && !reportId) return <div className="p-6 text-center">Loading job information...</div>;
  if (loading && reportId) return <div className="p-6 text-center">Loading report data...</div>;
  if (error) return <div className="p-6 text-center text-red-500">Error: {error}</div>;


  return (
    <ReportWrapper isPrintMode={isPrintMode}>
      {/* Print Header - Only visible when printing */}
      <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6 relative">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
        <div className="flex-1 text-center flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-black mb-1">{reportName}</h1>
        </div>
        <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
          NETA - MTS 7.2.1.1
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
      
      <div className="p-6 flex justify-center pb-20">
        <div className="max-w-7xl w-full space-y-6">
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
                  <label htmlFor="temperature.ambient" className="form-label inline-block w-32">Temp:</label>
                  <input id="temperature.ambient" type="number" value={formData.temperature.ambient} onChange={(e) => handleTemperatureChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                  <span className="mx-2">°F</span>
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
              <div className="md:col-span-2"><label htmlFor="address" className="form-label">Address:</label><input id="address" type="text" value={formData.address} readOnly className="form-input bg-gray-100 dark:bg-dark-200" style={{ width: `${Math.max(200, Math.min(500, formData.address.length * 10))}px`, minWidth: '200px', maxWidth: '500px' }} /></div>
              <div><label htmlFor="humidity" className="form-label">Humidity %:</label><input id="humidity" type="number" value={formData.temperature.humidity || ''} onChange={(e) => handleChange('temperature', 'humidity', Number(e.target.value))} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} placeholder="Optional" /></div>
            </div>
            {/* Print-only Job Information table */}
            <div className="hidden print:block">
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
                    humidity: formData.temperature.humidity,
                  },
                }}
              />
            </div>
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
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '70%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">NETA Section</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Result</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  {visualInspectionItemsConfig.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{item.id}</td>
                      <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{item.description}</td>
                      <td className="px-3 py-2">
                        <div className="print:hidden">
                          <select
                            value={formData.visualInspection[`${item.id}_result`] || 'Select One'}
                            onChange={(e) => handleVisualInspectionChange(item.id, 'result', e.target.value)}
                            disabled={!isEditing}
                            className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                          >
                            {visualInspectionOptions.map(option => (
                              <option key={option} value={option} className="dark:bg-dark-100 dark:text-white">{option}</option>
                            ))}
                          </select>
                        </div>
                        <div className="hidden print:block text-center">{formData.visualInspection[`${item.id}_result`] || ''}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Electrical Tests - Insulation Resistance */}
          <div className="mb-6">
            <div className="w-full h-1 bg-[#f26722] mb-4"></div>
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-insulation-resistance">
              Electrical Tests - Insulation Resistance
            </h2>
            
              {/* Insulation Resistance Values */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white border-b dark:border-gray-700 pb-2">Insulation Resistance Values</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-dark-200">
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
                        { id: 'primaryToGround', label: 'Primary to Ground' },
                        { id: 'secondaryToGround', label: 'Secondary to Ground' },
                        { id: 'primaryToSecondary', label: 'Primary to Secondary' }
                    ].map((testItem) => (
                      <tr key={testItem.id}>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{testItem.label}</td>
                        <td className="px-6 py-4">
                            <select
                            value={formData.insulationResistance[testItem.id]?.testVoltage || ''}
                            onChange={(e) => handleNestedChange('insulationResistance', testItem.id, { ...formData.insulationResistance[testItem.id], testVoltage: e.target.value })}
                              disabled={!isEditing}
                            className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            >
                              {testVoltageOptions.map(voltage => (
                                <option key={voltage} value={voltage} className="dark:bg-dark-100 dark:text-white">{voltage}</option>
                              ))}
                            </select>
                          </td>
                        <td className="px-6 py-4">
                            <input 
                              type="text" 
                            value={formData.insulationResistance[testItem.id]?.readings?.halfMinute || ''}
                            onChange={(e) => handleDeepNestedChange('insulationResistance', testItem.id, 'readings', 'halfMinute', e.target.value)}
                              readOnly={!isEditing} 
                            className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            />
                          </td>
                        <td className="px-6 py-4">
                            <input 
                              type="text" 
                            value={formData.insulationResistance[testItem.id]?.readings?.oneMinute || ''}
                            onChange={(e) => handleDeepNestedChange('insulationResistance', testItem.id, 'readings', 'oneMinute', e.target.value)}
                              readOnly={!isEditing} 
                            className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            />
                          </td>
                        <td className="px-6 py-4">
                            <input 
                              type="text" 
                            value={formData.insulationResistance[testItem.id]?.readings?.tenMinute || ''}
                            onChange={(e) => handleDeepNestedChange('insulationResistance', testItem.id, 'readings', 'tenMinute', e.target.value)}
                              readOnly={!isEditing} 
                            className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            />
                          </td>
                        <td className="px-6 py-4">
                            <select
                            value={formData.insulationResistance[testItem.id]?.unit || 'MΩ'}
                            onChange={(e) => handleNestedChange('insulationResistance', testItem.id, { ...formData.insulationResistance[testItem.id], unit: e.target.value })}
                              disabled={!isEditing}
                            className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                            >
                              {insulationResistanceUnits.map(unit => (
                                <option key={unit.symbol} value={unit.symbol} className="dark:bg-dark-100 dark:text-white">{unit.symbol}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
              </div>
            </div>
            
            {/* Temperature Corrected Values */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white border-b dark:border-gray-700 pb-2">Temperature Corrected Values</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Winding Under Test</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">0.5 Min.</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">1 Min.</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">10 Min.</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                      {[
                      { id: 'primaryToGround', label: 'Primary to Ground' },
                      { id: 'secondaryToGround', label: 'Secondary to Ground' },
                      { id: 'primaryToSecondary', label: 'Primary to Secondary' }
                    ].map((testItem) => (
                      <tr key={`${testItem.id}-corr`}>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{testItem.label}</td>
                        <td className="px-6 py-4">
                            <input 
                              type="text" 
                            value={formData.insulationResistance[testItem.id]?.corrected?.halfMinute || ''}
                              readOnly 
                            className="form-input w-full bg-gray-100 dark:bg-dark-200"
                            />
                        </td>
                        <td className="px-6 py-4">
                            <input 
                              type="text" 
                            value={formData.insulationResistance[testItem.id]?.corrected?.oneMinute || ''}
                              readOnly 
                            className="form-input w-full bg-gray-100 dark:bg-dark-200"
                            />
                        </td>
                        <td className="px-6 py-4">
                            <input 
                              type="text" 
                            value={formData.insulationResistance[testItem.id]?.corrected?.tenMinute || ''}
                              readOnly 
                            className="form-input w-full bg-gray-100 dark:bg-dark-200"
                            />
                        </td>
                        <td className="px-6 py-4">
                            <input 
                              type="text" 
                            value={formData.insulationResistance[testItem.id]?.unit || 'MΩ'}
                              readOnly 
                            className="form-input w-full bg-gray-100 dark:bg-dark-200"
                            />
                        </td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
            </div>
          </div>

          {/* Calculated Values */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white border-b dark:border-gray-700 pb-2">Calculated Values</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                  <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/3">Calculated Values</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Primary</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Secondary</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Pri-Sec</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acceptable</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      Dielectric Absorption
                        <div className="text-xs text-gray-500 dark:text-gray-400">(Ratio of 1 Min. to 0.5 Minute Result)</div>
                    </td>
                      <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={formData.insulationResistance.primaryToGround?.dielectricAbsorption || ''} 
                        readOnly 
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                      />
                    </td>
                      <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={formData.insulationResistance.secondaryToGround?.dielectricAbsorption || ''} 
                        readOnly 
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                      />
                    </td>
                      <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={formData.insulationResistance.primaryToSecondary?.dielectricAbsorption || ''} 
                        readOnly 
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                      />
                    </td>
                      <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.insulationResistance.dielectricAbsorptionAcceptable}
                        readOnly
                          className={`form-input w-full bg-gray-100 dark:bg-dark-200 ${
                          formData.insulationResistance.dielectricAbsorptionAcceptable === 'Yes'
                            ? 'text-green-600 dark:text-green-400 font-medium'
                            : formData.insulationResistance.dielectricAbsorptionAcceptable === 'No'
                            ? 'text-red-600 dark:text-red-400 font-medium'
                              : ''
                        }`}
                      />
                    </td>
                  </tr>
                  <tr>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      Polarization Index
                        <div className="text-xs text-gray-500 dark:text-gray-400">(Ratio of 10 Min. to 1 Min. Result)</div>
                    </td>
                      <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={formData.insulationResistance.primaryToGround?.polarizationIndex || ''} 
                        readOnly 
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                      />
                    </td>
                      <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={formData.insulationResistance.secondaryToGround?.polarizationIndex || ''} 
                        readOnly 
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                      />
                    </td>
                      <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={formData.insulationResistance.primaryToSecondary?.polarizationIndex || ''} 
                        readOnly 
                          className="form-input w-full bg-gray-100 dark:bg-dark-200"
                      />
                    </td>
                      <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.insulationResistance.polarizationIndexAcceptable}
                        readOnly
                          className={`form-input w-full bg-gray-100 dark:bg-dark-200 ${
                          formData.insulationResistance.polarizationIndexAcceptable === 'Yes'
                            ? 'text-green-600 dark:text-green-400 font-medium'
                            : formData.insulationResistance.polarizationIndexAcceptable === 'No'
                            ? 'text-red-600 dark:text-red-400 font-medium'
                              : ''
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
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-test-equipment">
              Test Equipment Used
            </h2>
             <div className="grid grid-cols-1 gap-6 test-eqpt-onscreen print:hidden">
               <div className="grid grid-cols-3 gap-4 border-b dark:border-gray-700 pb-4">
              <div>
                  <label className="form-label">Megohmmeter:</label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.name}
                     onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', { ...formData.testEquipment.megohmmeter, name: e.target.value })} 
                  readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div>
                  <label className="form-label">Serial Number:</label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.serialNumber}
                     onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', { ...formData.testEquipment.megohmmeter, serialNumber: e.target.value })} 
                  readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
              </div>
              <div>
                  <label className="form-label">AMP ID:</label>
                <input
                  type="text"
                  value={formData.testEquipment.megohmmeter.ampId}
                     onChange={(e) => handleNestedChange('testEquipment', 'megohmmeter', { ...formData.testEquipment.megohmmeter, ampId: e.target.value })} 
                  readOnly={!isEditing}
                    className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
                />
                 </div>
              </div>
            </div>
            {/* Print-only compact Test Equipment table (3 boxes wide, 1 row) */}
            <div className="hidden print:block">
              <table className="w-full table-fixed border-collapse border border-gray-300 print:border-black print:border text-[0.85rem]">
                <colgroup>
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                  <col style={{ width: '33.33%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                      <div className="font-semibold">Megohmmeter:</div>
                      <div className="mt-0">{formData.testEquipment.megohmmeter.name || ''}</div>
                    </td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
                      <div className="font-semibold">Serial Number:</div>
                      <div className="mt-0">{formData.testEquipment.megohmmeter.serialNumber || ''}</div>
                    </td>
                    <td className="p-2 align-top border border-gray-300 print:border-black print:border">
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
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2 print:text-black print:border-black print:font-bold section-comments">
              Comments
            </h2>
              <textarea
                value={formData.comments}
                onChange={(e) => handleChange(null, 'comments', e.target.value)}
              rows={1}
                readOnly={!isEditing}
              className={`form-textarea w-full resize-none ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
              placeholder="Enter comments here..."
              />
              {/* Print-only comments box */}
              <div className="hidden print:block mt-2">
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
      </div>
    </ReportWrapper>
  );
};

export default LargeDryTypeXfmrMTSReport;

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
      }
      
      .form-input, .form-select, .form-textarea {
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
      
      /* Table styling with proper alignment */
      table { 
        border-collapse: collapse; 
        width: 100%; 
        border: 1px solid black !important;
        table-layout: fixed !important;
      }
      th, td { 
        border: 1px solid black !important; 
        padding: 4px !important; 
        color: black !important;
        text-align: center !important;
        vertical-align: middle !important;
      }
      th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important; 
        text-align: center !important;
      }
      
      /* Ensure all table cells have borders */
      table th, table td {
        border: 1px solid black !important;
      }
      
      /* First column (labels) should be left-aligned */
      th:first-child, td:first-child {
        text-align: left !important;
        width: 25% !important;
      }
      
      /* Center align all other columns */
      th:not(:first-child), td:not(:first-child) {
        text-align: center !important;
      }
      
      /* Ensure inputs in table cells are properly aligned */
      td input, td select {
        width: 100% !important;
        text-align: center !important;
        margin: 0 !important;
        padding: 2px 4px !important;
        box-sizing: border-box !important;
      }
      
      /* Specific styling for electrical test tables */
      .section-insulation-resistance table {
        border: 1px solid black !important;
        table-layout: fixed !important;
      }
      
      .section-insulation-resistance th,
      .section-insulation-resistance td {
        border: 1px solid black !important;
        padding: 4px !important;
        text-align: center !important;
      }
      
      .section-insulation-resistance th:first-child,
      .section-insulation-resistance td:first-child {
        text-align: left !important;
        width: 25% !important;
      }
      
      .section-insulation-resistance td input,
      .section-insulation-resistance td select {
        width: 100% !important;
        text-align: center !important;
        margin: 0 !important;
        padding: 2px 4px !important;
        box-sizing: border-box !important;
      }
      
      button {
        display: none !important;
      }
      
      section { 
        break-inside: avoid !important;
        margin-bottom: 20px !important; 
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
      /* Force-hide on-screen grids in print to avoid duplication */
      .job-info-onscreen, .job-info-onscreen * { display: none !important; }
      .test-eqpt-onscreen, .test-eqpt-onscreen * { display: none !important; }
      .hidden.print\:block { display: block !important; }
      
      /* Additional aggressive hiding for any remaining on-screen elements */
      .section-job-info .grid { display: none !important; }
      .section-job-info input, .section-job-info label { display: none !important; }
      .section-job-info .flex { display: none !important; }
      .section-job-info .md\\:col-span-2 { display: none !important; }
      
      /* Ensure JobInfoPrintTable is visible in print */
      .section-job-info .hidden.print\\:block { display: block !important; }
      .section-job-info .hidden.print\\:block * { display: block !important; }

      /* Hide on-screen elements in print */
      .job-info-onscreen,
      .job-info-onscreen *,
      .test-eqpt-onscreen,
      .test-eqpt-onscreen *,
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

// Helper styles (can be moved to a global CSS or Tailwind config)
// .form-label { @apply block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1; }
// .form-input, .form-select, .form-textarea {
//   @apply mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm
//   focus:outline-none focus:ring-[#f26722] focus:border-[#f26722]
//   bg-white dark:bg-dark-100 text-gray-900 dark:text-white;
// }
// .form-input[readonly], .form-select[disabled], .form-textarea[readonly] {
//   @apply bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-gray-400 cursor-not-allowed;
// }
// .table-header { @apply px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-gray-50 dark:bg-dark-200; }
// .table-cell { @apply px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white; }
