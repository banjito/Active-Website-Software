import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';

// Types
interface CableTestData {
  customer: string;
  address: string;
  user: string;
  date: string;
  jobNumber: string;
  technicians: string;
  substation: string;
  eqptLocation: string;
  identifier: string;
  // Environmental data
  temperature: number;
  humidity: number;
  // Cable data
  testedFrom: string;
  manufacturer: string;
  conductorMaterial: string;
  insulationType: string;
  systemVoltage: string;
  ratedVoltage: string;
  length: string;
  // Inspections (7.3.1.A series)
  inspectionResults: Record<string, string>;
  // Test data
  testVoltage: string;
  testSets: TestSet[];
  // Equipment
  testEquipment: {
    megohmmeter: string;
    serialNumber: string;
    ampId: string;
    comments: string;
  };
}

interface TestSet {
  id: number;
  from: string;
  to: string;
  size: string;
  result: string;
  configuration: string; // Added this, might be useful later
  readings: {
    aToGround: string;
    bToGround: string;
    cToGround: string;
    nToGround: string;
    aToB: string;
    bToC: string;
    cToA: string;
    aToN: string;
    bToN: string;
    cToN: string;
    continuity: string; // Assuming continuity is a simple text field or dropdown
  };
  // Calculated values with temperature correction
  correctedReadings: {
    aToGround: string;
    bToGround: string;
    cToGround: string;
    nToGround: string;
    aToB: string;
    bToC: string;
    cToA: string;
    aToN: string;
    bToN: string;
    cToN: string;
    continuity: string; // Continuity likely doesn't need correction
  };
}

// Define a type for the customer data we expect
interface CustomerInfo {
  id: string;
  name: string | null;
  company_name: string | null;
  address: string | null;
}

// Constants (from the Excel file's Dropdowns sheet)
const INSPECTION_RESULTS_OPTIONS = [
  "Select One",
  "Satisfactory",
  "Unsatisfactory",
  "Cleaned",
  "See Comments",
  "Not Applicable"
];

const INSULATION_RESISTANCE_UNITS = [
  { value: "kΩ", label: "Kilo-Ohms" },
  { value: "MΩ", label: "Mega-Ohms" },
  { value: "GΩ", label: "Giga-Ohms" }
];

const TEST_VOLTAGES = ["250V", "500V", "1000V", "2500V", "5000V"];

const CABLE_SIZES = [
  "#18", "#16", "#12", "#10", "#8", "#6", "#4", "#2", "#1",
  "1/0", "2/0", "3/0", "4/0", "250", "300", "350", "400", "500", "600", "750", "1000"
];

const EVALUATION_RESULTS = ["PASS", "FAIL", "LIMITED SERVICE"];

// Temperature Conversion Data (from Temp Conv sheet)
// Reduced version for brevity, expand as needed
const TEMP_CONVERSION_DATA: { fahrenheit: number; celsius: number }[] = [
  // Generate a comprehensive temperature conversion table from -50°F to 230°F
  ...[...Array(281)].map((_, i) => {
    const fahrenheit = -50 + i;
    const celsius = (fahrenheit - 32) * 5 / 9;
    return { fahrenheit, celsius: parseFloat(celsius.toFixed(1)) };
  })
];

// Temperature Correction Factor Data (from TCF sheet)
// Reduced version for brevity, expand as needed
const TCF_DATA: { celsius: number; multiplier: number }[] = [
  { celsius: -24, multiplier: 0.054 },
  { celsius: -23, multiplier: 0.068 },
  { celsius: -22, multiplier: 0.082 },
  { celsius: -21, multiplier: 0.096 },
  { celsius: -20, multiplier: 0.11 },
  { celsius: -19, multiplier: 0.124 },
  { celsius: -18, multiplier: 0.138 },
  { celsius: -17, multiplier: 0.152 },
  { celsius: -16, multiplier: 0.166 },
  { celsius: -15, multiplier: 0.18 },
  { celsius: -14, multiplier: 0.194 },
  { celsius: -13, multiplier: 0.208 },
  { celsius: -12, multiplier: 0.222 },
  { celsius: -11, multiplier: 0.236 },
  { celsius: -10, multiplier: 0.25 },
  { celsius: -9, multiplier: 0.264 },
  { celsius: -8, multiplier: 0.278 },
  { celsius: -7, multiplier: 0.292 },
  { celsius: -6, multiplier: 0.306 },
  { celsius: -5, multiplier: 0.32 },
  { celsius: -4, multiplier: 0.336 },
  { celsius: -3, multiplier: 0.352 },
  { celsius: -2, multiplier: 0.368 },
  { celsius: -1, multiplier: 0.384 },
  { celsius: 0, multiplier: 0.4 },
  { celsius: 1, multiplier: 0.42 },
  { celsius: 2, multiplier: 0.44 },
  { celsius: 3, multiplier: 0.46 },
  { celsius: 4, multiplier: 0.48 },
  { celsius: 5, multiplier: 0.5 },
  { celsius: 6, multiplier: 0.526 },
  { celsius: 7, multiplier: 0.552 },
  { celsius: 8, multiplier: 0.578 },
  { celsius: 9, multiplier: 0.604 },
  { celsius: 10, multiplier: 0.63 },
  { celsius: 11, multiplier: 0.666 },
  { celsius: 12, multiplier: 0.702 },
  { celsius: 13, multiplier: 0.738 },
  { celsius: 14, multiplier: 0.774 },
  { celsius: 15, multiplier: 0.81 },
  { celsius: 16, multiplier: 0.848 },
  { celsius: 17, multiplier: 0.886 },
  { celsius: 18, multiplier: 0.924 },
  { celsius: 19, multiplier: 0.962 },
  { celsius: 20, multiplier: 1 },
  { celsius: 21, multiplier: 1.05 },
  { celsius: 22, multiplier: 1.1 },
  { celsius: 23, multiplier: 1.15 },
  { celsius: 24, multiplier: 1.2 },
  { celsius: 25, multiplier: 1.25 },
  { celsius: 26, multiplier: 1.316 },
  { celsius: 27, multiplier: 1.382 },
  { celsius: 28, multiplier: 1.448 },
  { celsius: 29, multiplier: 1.514 },
  { celsius: 30, multiplier: 1.58 },
  { celsius: 31, multiplier: 1.664 },
  { celsius: 32, multiplier: 1.748 },
  { celsius: 33, multiplier: 1.832 },
  { celsius: 34, multiplier: 1.872 },
  { celsius: 35, multiplier: 2 },
  { celsius: 36, multiplier: 2.1 },
  { celsius: 37, multiplier: 2.2 },
  { celsius: 38, multiplier: 2.3 },
  { celsius: 39, multiplier: 2.4 },
  { celsius: 40, multiplier: 2.5 },
  { celsius: 41, multiplier: 2.628 },
  { celsius: 42, multiplier: 2.756 },
  { celsius: 43, multiplier: 2.884 },
  { celsius: 44, multiplier: 3.012 },
  { celsius: 45, multiplier: 3.15 },
  { celsius: 46, multiplier: 3.316 },
  { celsius: 47, multiplier: 3.482 },
  { celsius: 48, multiplier: 3.648 },
  { celsius: 49, multiplier: 3.814 },
  { celsius: 50, multiplier: 3.98 },
  { celsius: 51, multiplier: 4.184 },
  { celsius: 52, multiplier: 4.388 },
  { celsius: 53, multiplier: 4.592 },
  { celsius: 54, multiplier: 4.796 },
  { celsius: 55, multiplier: 5 },
  { celsius: 56, multiplier: 5.26 },
  { celsius: 57, multiplier: 5.52 },
  { celsius: 58, multiplier: 5.78 },
  { celsius: 59, multiplier: 6.04 },
  { celsius: 60, multiplier: 6.3 },
  { celsius: 61, multiplier: 6.62 },
  { celsius: 62, multiplier: 6.94 },
  { celsius: 63, multiplier: 7.26 },
  { celsius: 64, multiplier: 7.58 },
  { celsius: 65, multiplier: 7.9 },
  { celsius: 66, multiplier: 8.32 },
  { celsius: 67, multiplier: 8.74 },
  { celsius: 68, multiplier: 9.16 },
  { celsius: 69, multiplier: 9.58 },
  { celsius: 70, multiplier: 10 },
  { celsius: 71, multiplier: 10.52 },
  { celsius: 72, multiplier: 11.04 },
  { celsius: 73, multiplier: 11.56 },
  { celsius: 74, multiplier: 12.08 },
  { celsius: 75, multiplier: 12.6 },
  { celsius: 76, multiplier: 13.24 },
  { celsius: 77, multiplier: 13.88 },
  { celsius: 78, multiplier: 14.52 },
  { celsius: 79, multiplier: 15.16 },
  { celsius: 80, multiplier: 15.8 },
  { celsius: 81, multiplier: 16.64 },
  { celsius: 82, multiplier: 17.48 },
  { celsius: 83, multiplier: 18.32 },
  { celsius: 84, multiplier: 19.16 },
  { celsius: 85, multiplier: 20 },
  { celsius: 86, multiplier: 21.04 },
  { celsius: 87, multiplier: 22.08 },
  { celsius: 88, multiplier: 23.12 },
  { celsius: 89, multiplier: 24.16 },
  { celsius: 90, multiplier: 25.2 },
  { celsius: 91, multiplier: 26.45 },
  { celsius: 92, multiplier: 27.7 },
  { celsius: 93, multiplier: 28.95 },
  { celsius: 94, multiplier: 30.2 },
  { celsius: 95, multiplier: 31.6 },
  { celsius: 96, multiplier: 33.28 },
  { celsius: 97, multiplier: 34.96 },
  { celsius: 98, multiplier: 36.64 },
  { celsius: 99, multiplier: 38.32 },
  { celsius: 100, multiplier: 40 },
  // Continue up to 130 C as in the Excel sheet
  ...[...Array(31)].map((_, i) => {
    const celsius = 100 + i;
    const multiplier = 40 + i * (i <= 10 ? 2 : (i <= 20 ? 4 : 8)); // Example non-linear progression
    return { celsius, multiplier: parseFloat(multiplier.toFixed(2)) };
  })
];

const convertFahrenheitToCelsius = (fahrenheit: number): number => {
    if (fahrenheit === null || fahrenheit === undefined) return 0;
    // Find the closest fahrenheit value in the table
    const closest = TEMP_CONVERSION_DATA.reduce((prev, curr) => 
      Math.abs(curr.fahrenheit - fahrenheit) < Math.abs(prev.fahrenheit - fahrenheit) ? curr : prev
    );
    return closest.celsius;
};

// Find the Temperature Correction Factor from the table
// If the exact Celsius value is not found, interpolate
const getTCF = (celsius: number): number => {
  if (celsius === null || celsius === undefined) return 1;
  
  // Find exact match first
  const exactMatch = TCF_DATA.find(data => data.celsius === celsius);
  if (exactMatch) {
    return exactMatch.multiplier; // Return exact value from table
  }
  
  // If no exact match, interpolate between surrounding values
  let lowerBound = TCF_DATA.filter(data => data.celsius < celsius).pop();
  let upperBound = TCF_DATA.filter(data => data.celsius > celsius).shift();

  if (!lowerBound && !upperBound) return 1; // Should not happen with a comprehensive table
  if (!lowerBound) return upperBound!.multiplier;
  if (!upperBound) return lowerBound.multiplier;

  // Linear interpolation
  const range = upperBound.celsius - lowerBound.celsius;
  const position = celsius - lowerBound.celsius;
  const difference = upperBound.multiplier - lowerBound.multiplier;
  
  const interpolatedValue = lowerBound.multiplier + (position / range) * difference;
  
  // Don't round here to maintain precision
  return interpolatedValue;
};


// Apply the TCF to a reading
const applyTCF = (reading: string, tcf: number): string => {
  const numericReading = parseFloat(reading);
  if (isNaN(numericReading) || tcf === 1) {
    return reading; // Return original if not a number or TCF is 1
  }
  const correctedValue = numericReading * tcf;
  
  // Format to a reasonable number of significant figures
  return correctedValue.toPrecision(4);
};


const ThreeLowVoltageCableATSForm: React.FC = () => {
  const { id: jobId, reportId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState<CableTestData>({
    customer: "",
    address: "",
    user: user?.email || "",
    date: new Date().toISOString().split('T')[0],
    jobNumber: "",
    technicians: "",
    substation: "",
    eqptLocation: "",
    identifier: "",
    temperature: 70,
    humidity: 50,
    testedFrom: "",
    manufacturer: "",
    conductorMaterial: "",
    insulationType: "",
    systemVoltage: "",
    ratedVoltage: "",
    length: "",
    inspectionResults: {
        "7.3.1.A.1": "Select One",
        "7.3.1.A.2": "Select One",
        "7.3.1.A.3": "Select One",
        "7.3.1.A.4": "Select One",
        "7.3.1.A.5": "Select One",
        "7.3.1.A.6": "Select One",
        "7.3.1.A.7": "Select One",
        "7.3.1.A.8": "Select One"
    },
    testVoltage: "1000V",
    testSets: Array.from({ length: 3 }, (_, i) => ({ // Changed to 3 sets
      id: i,
      from: "",
      to: "",
      size: "",
      result: "PASS",
      configuration: "",
      readings: {
        aToGround: "",
        bToGround: "",
        cToGround: "",
        nToGround: "",
        aToB: "",
        bToC: "",
        cToA: "",
        aToN: "",
        bToN: "",
        cToN: "",
        continuity: "",
      },
      correctedReadings: {
        aToGround: "",
        bToGround: "",
        cToGround: "",
        nToGround: "",
        aToB: "",
        bToC: "",
        cToA: "",
        aToN: "",
        bToN: "",
        cToN: "",
        continuity: "",
      }
    })),
    testEquipment: {
      megohmmeter: "",
      serialNumber: "",
      ampId: "",
      comments: ""
    },
  });
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(!reportId);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');
  const reportSlug = 'low-voltage-cable-test-3sets-ats'; // New ATS slug
  

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
          user: user?.email || prev.user || '' 
        }));
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      setError(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      // setLoading(false);
    }
  };

  // Add loadReport function to load existing report data
  const loadReport = async () => {
    if (!reportId) {
      setLoading(false); // No report to load, finish loading
      return;
    }
    
    try {
      // Keep loading true while fetching report
      console.log(`Loading report with ID: ${reportId}`);
      
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('low_voltage_cable_test_3sets') // Using the same table for ATS
        .select('*')
        .eq('id', reportId);
      
      if (error) {
        console.error('Error loading report:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error('Error loading report: No report found with this ID in this table.');
        throw new Error('No report found with this ID. The link may be incorrect.');
      }

      if (data.length > 1) {
        console.error('Error loading report: Multiple reports found with this ID.');
        throw new Error('Multiple reports found with this ID. Please contact support.');
      }

      const reportData = data[0];
      
      if (reportData && reportData.data) {
        console.log('Report data loaded successfully:', reportData.data);
        // Merge loaded data with existing data (like job info)
        setFormData(prevData => ({
          ...prevData, // Keep job info and user from loadJobInfo
          ...reportData.data, // Load report-specific data
          temperature: reportData.data.temperature ?? prevData.temperature,
          humidity: reportData.data.humidity ?? prevData.humidity,
          testSets: reportData.data.testSets ?? prevData.testSets,
          testEquipment: reportData.data.testEquipment ?? prevData.testEquipment,
        }));
        
        if (reportData.data.status) {
          setStatus(reportData.data.status);
        }
        setIsEditMode(false); // Existing report loaded, start in view mode
      } else {
        console.warn('No data found for report ID:', reportId);
      }
    } catch (error) {
      console.error('Error in loadReport:', error);
      setError(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false); // Finish loading after report fetch attempt
    }
  };

  // Combined effect for loading job and report data
  useEffect(() => {
    if (jobId && user) {
      loadJobInfo().then(() => {
        if (reportId) {
          loadReport();
        } else {
          setLoading(false);
          setIsEditMode(true);
        }
      });
    } else if (!jobId) {
      setError("Job ID is missing.");
      setLoading(false);
    } else if (!user) {
      setError("User not authenticated.");
      setLoading(false);
    }
  }, [jobId, reportId, user]);


  // Derived values
  const celsiusTemperature = convertFahrenheitToCelsius(formData.temperature);
  const tcf = getTCF(celsiusTemperature);

  // Recalculate corrected readings
  useEffect(() => {
    const updatedTestSets = formData.testSets.map(set => {
      const correctedReadings = {
        aToGround: applyTCF(set.readings.aToGround, tcf),
        bToGround: applyTCF(set.readings.bToGround, tcf),
        cToGround: applyTCF(set.readings.cToGround, tcf),
        nToGround: applyTCF(set.readings.nToGround, tcf),
        aToB: applyTCF(set.readings.aToB, tcf),
        bToC: applyTCF(set.readings.bToC, tcf),
        cToA: applyTCF(set.readings.cToA, tcf),
        aToN: applyTCF(set.readings.aToN, tcf),
        bToN: applyTCF(set.readings.bToN, tcf),
        cToN: applyTCF(set.readings.cToN, tcf),
        continuity: set.readings.continuity,
      };
      
      if (JSON.stringify(set.correctedReadings) !== JSON.stringify(correctedReadings)) {
        return { ...set, correctedReadings };
      }
      return set;
    });
    
    if (JSON.stringify(formData.testSets) !== JSON.stringify(updatedTestSets)) {
        setFormData(prev => ({ ...prev, testSets: updatedTestSets }));
    }
  }, [formData.temperature, JSON.stringify(formData.testSets.map(s => s.readings)), tcf]);

  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name.startsWith('testEquipment.')) {
      const field = name.split('.')[1] as keyof typeof formData.testEquipment;
      setFormData(prev => ({
        ...prev,
        testEquipment: { ...prev.testEquipment, [field]: value }
      }));
    } else {
      const targetValue = (e.target as HTMLInputElement).type === 'number' 
                          ? (value === '' ? '' : parseFloat(value))
                          : value;
      setFormData(prev => ({ ...prev, [name]: targetValue }));
    }
  };

  const handleReadingChange = (setId: number, field: keyof TestSet['readings'], value: string) => {
    setFormData(prev => ({
      ...prev,
      testSets: prev.testSets.map(set => 
        set.id === setId 
          ? { ...set, readings: { ...set.readings, [field]: value } } 
          : set
      )
    }));
  };

  const handleTestSetChange = (setId: number, field: keyof Pick<TestSet, 'from' | 'to' | 'size' | 'result'>, value: string) => {
     setFormData(prev => ({
       ...prev,
       testSets: prev.testSets.map(set => 
         set.id === setId 
           ? { ...set, [field]: value } 
           : set
       )
     }));
  };

  const handleInspectionChange = (section: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      inspectionResults: {
        ...prev.inspectionResults,
        [section]: value
      }
    }));
  };
  
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditMode) return;
    
    setIsSaving(true);
    setError(null);
    try {
        console.log('Attempting to save to schema: neta_ops, table: low_voltage_cable_test_3sets');
        
        const reportDataToSave = { ...formData, status: status };
        
        const reportPayload = {
            job_id: jobId,
            user_id: user.id,
            data: reportDataToSave,
            updated_at: new Date().toISOString()
        };

        console.log('Payload:', reportPayload);

        let savedReportId = reportId;
        let operation: 'update' | 'insert' = 'insert';

        if (reportId) {
            operation = 'update';
            const { error: updateError } = await supabase
                .schema('neta_ops')
                .from('low_voltage_cable_test_3sets')
                .update(reportPayload)
                .eq('id', reportId);
                
            if (updateError) {
                console.error('Update error details:', updateError);
                throw updateError;
            }
            console.log("Report updated successfully");
            
        } else {
            operation = 'insert';
            const insertPayload = { ...reportPayload, created_at: new Date().toISOString() };
            console.log('Insert Payload:', insertPayload);
            
            const { data: insertData, error: insertError } = await supabase
                .schema('neta_ops')
                .from('low_voltage_cable_test_3sets')
                .insert(insertPayload)
                .select('id')
                .single();
                
            if (insertError) {
                console.error('Insert error details:', insertError);
                throw insertError;
            }
            savedReportId = insertData.id;
            console.log("Report created successfully with ID:", savedReportId);
            
            const assetData = {
                name: getAssetName(reportSlug, formData.identifier || ''),
                file_url: `report:/jobs/${jobId}/${reportSlug}/${savedReportId}`,
                user_id: user.id,
                created_at: new Date().toISOString()
            };
            
            console.log('Creating asset entry:', assetData);
            const { data: assetResult, error: assetError } = await supabase
                .schema('neta_ops')
                .from('assets')
                .insert(assetData)
                .select('id')
                .single();
            
            if (assetError) {
                console.error('Error creating asset record:', assetError);
                alert("Report saved, but failed to create asset link.");
            } else if (assetResult) {
                console.log('Asset created with ID:', assetResult.id);
                
                const jobAssetData = {
                    job_id: jobId,
                    asset_id: assetResult.id,
                    user_id: user.id
                };
                
                console.log('Linking asset to job:', jobAssetData);
                const { error: jobAssetError } = await supabase
                    .schema('neta_ops')
                    .from('job_assets')
                    .insert(jobAssetData);
                
                if (jobAssetError) {
                    console.error('Error linking asset to job:', jobAssetError);
                    alert("Report saved and asset created, but failed to link asset to job.");
                } else {
                    console.log('Asset successfully linked to job');
                }
            }
        }
        
        setIsEditMode(false);
        alert(`Report ${operation === 'update' ? 'updated' : 'saved'} successfully!`);
        navigateAfterSave(navigate, jobId, location);

    } catch (err: any) {
        console.error("Error saving report:", err);
        setError(`Failed to save report: ${err.message || 'Unknown error'}`);
        alert(`Error saving report: ${err.message || 'Unknown error'}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, currentPos: { row: number, col: number }) => {
    const { row, col } = currentPos;
    const TOTAL_COLS = 15;
    const TOTAL_ROWS = 3; // 3 sets for this component

    if (e.target instanceof HTMLSelectElement && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }

    switch (e.key) {
      case 'ArrowRight':
        if (col < TOTAL_COLS - 1) {
          e.preventDefault();
          const nextElement = document.querySelector(`[data-position="${row}-${col + 1}"]`) as HTMLElement;
          nextElement?.focus();
        }
        break;
      case 'ArrowLeft':
        if (col > 0) {
          e.preventDefault();
          const prevElement = document.querySelector(`[data-position="${row}-${col - 1}"]`) as HTMLElement;
          prevElement?.focus();
        }
        break;
      case 'ArrowDown':
        if (row < TOTAL_ROWS - 1) {
          e.preventDefault();
          const nextElement = document.querySelector(`[data-position="${row + 1}-${col}"]`) as HTMLElement;
          nextElement?.focus();
        }
        break;
      case 'ArrowUp':
        if (row > 0) {
          e.preventDefault();
          const prevElement = document.querySelector(`[data-position="${row - 1}-${col}"]`) as HTMLElement;
          prevElement?.focus();
        }
        break;
    }
  };

  const renderHeader = () => (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        3-Set Low Voltage Cable Test Report (ATS)
      </h1>
      <div className="flex items-center space-x-4">
        {isEditMode ? (
          <>
            <button
              onClick={() => setStatus(status === 'PASS' ? 'FAIL' : 'PASS')}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                status === 'PASS' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {status}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#f26722] hover:bg-[#e55611] text-white font-medium px-4 py-2 rounded-md disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : reportId ? 'Update Report' : 'Save Report'}
            </button>
          </>
        ) : (
          <>
            <span className={`px-4 py-2 rounded-md text-white font-medium ${
                status === 'PASS' ? 'bg-green-600' : 'bg-red-600'
              }`}>{status}</span>
            <button
              onClick={() => setIsEditMode(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-md"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );

  const getInputClassName = (additionalClasses: string = "") => {
    return `form-input ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''} ${additionalClasses}`;
  };

  const getSelectClassName = (additionalClasses: string = "") => {
    return `form-select ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''} ${additionalClasses}`;
  };

  const getTextAreaClassName = (additionalClasses: string = "") => {
    return `form-textarea ${!isEditMode ? 'bg-gray-100 dark:bg-dark-200' : ''} ${additionalClasses}`;
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }
  
  return (
    <div className="p-6 bg-gray-50 dark:bg-dark-200 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {renderHeader()}
        
        {/* Main report content */}
        <div className="space-y-6">
            {/* Job Information Section */}
            <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Job Information</h2>
                {/* ... form fields for job info ... */}
            </section>
            {/* ... other sections ... */}
        </div>
      </div>
    </div>
  );
};

export default ThreeLowVoltageCableATSForm; 