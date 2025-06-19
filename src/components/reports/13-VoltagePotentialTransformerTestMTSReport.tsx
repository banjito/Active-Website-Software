import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import _ from 'lodash';
import { navigateAfterSave } from './ReportUtils';
import { getReportName, getAssetName } from './reportMappings';

// Temperature conversion and correction factor lookup tables
const tcfData: Array<{ celsius: number; multiplier: number }> = [
  { celsius: -24, multiplier: 0.054 }, { celsius: -23, multiplier: 0.068 }, { celsius: -22, multiplier: 0.082 }, { celsius: -21, multiplier: 0.096 }, { celsius: -20, multiplier: 0.11 },
  { celsius: -19, multiplier: 0.124 }, { celsius: -18, multiplier: 0.138 }, { celsius: -17, multiplier: 0.152 }, { celsius: -16, multiplier: 0.166 }, { celsius: -15, multiplier: 0.18 },
  { celsius: -14, multiplier: 0.194 }, { celsius: -13, multiplier: 0.208 }, { celsius: -12, multiplier: 0.222 }, { celsius: -11, multiplier: 0.236 }, { celsius: -10, multiplier: 0.25 },
  { celsius: -9, multiplier: 0.264 }, { celsius: -8, multiplier: 0.278 }, { celsius: -7, multiplier: 0.292 }, { celsius: -6, multiplier: 0.306 }, { celsius: -5, multiplier: 0.32 },
  { celsius: -4, multiplier: 0.336 }, { celsius: -3, multiplier: 0.352 }, { celsius: -2, multiplier: 0.368 }, { celsius: -1, multiplier: 0.384 }, { celsius: 0, multiplier: 0.4 },
  { celsius: 1, multiplier: 0.42 }, { celsius: 2, multiplier: 0.44 }, { celsius: 3, multiplier: 0.46 }, { celsius: 4, multiplier: 0.48 }, { celsius: 5, multiplier: 0.5 },
  { celsius: 6, multiplier: 0.526 }, { celsius: 7, multiplier: 0.552 }, { celsius: 8, multiplier: 0.578 }, { celsius: 9, multiplier: 0.604 }, { celsius: 10, multiplier: 0.63 },
  { celsius: 11, multiplier: 0.666 }, { celsius: 12, multiplier: 0.702 }, { celsius: 13, multiplier: 0.738 }, { celsius: 14, multiplier: 0.774 }, { celsius: 15, multiplier: 0.81 },
  { celsius: 16, multiplier: 0.848 }, { celsius: 17, multiplier: 0.886 }, { celsius: 18, multiplier: 0.924 }, { celsius: 19, multiplier: 0.962 }, { celsius: 20, multiplier: 1 },
  { celsius: 21, multiplier: 1.05 }, { celsius: 22, multiplier: 1.1 }, { celsius: 23, multiplier: 1.15 }, { celsius: 24, multiplier: 1.2 }, { celsius: 25, multiplier: 1.25 },
  { celsius: 26, multiplier: 1.316 }, { celsius: 27, multiplier: 1.382 }, { celsius: 28, multiplier: 1.448 }, { celsius: 29, multiplier: 1.514 }, { celsius: 30, multiplier: 1.58 },
  { celsius: 31, multiplier: 1.664 }, { celsius: 32, multiplier: 1.748 }, { celsius: 33, multiplier: 1.832 }, { celsius: 34, multiplier: 1.872 }, { celsius: 35, multiplier: 2 },
  { celsius: 36, multiplier: 2.1 }, { celsius: 37, multiplier: 2.2 }, { celsius: 38, multiplier: 2.3 }, { celsius: 39, multiplier: 2.4 }, { celsius: 40, multiplier: 2.5 },
  { celsius: 41, multiplier: 2.628 }, { celsius: 42, multiplier: 2.756 }, { celsius: 43, multiplier: 2.884 }, { celsius: 44, multiplier: 3.012 }, { celsius: 45, multiplier: 3.15 },
  { celsius: 46, multiplier: 3.316 }, { celsius: 47, multiplier: 3.482 }, { celsius: 48, multiplier: 3.648 }, { celsius: 49, multiplier: 3.814 }, { celsius: 50, multiplier: 3.98 },
  { celsius: 51, multiplier: 4.184 }, { celsius: 52, multiplier: 4.388 }, { celsius: 53, multiplier: 4.592 }, { celsius: 54, multiplier: 4.796 }, { celsius: 55, multiplier: 5 },
  { celsius: 56, multiplier: 5.26 }, { celsius: 57, multiplier: 5.52 }, { celsius: 58, multiplier: 5.78 }, { celsius: 59, multiplier: 6.04 }, { celsius: 60, multiplier: 6.3 },
  { celsius: 61, multiplier: 6.62 }, { celsius: 62, multiplier: 6.94 }, { celsius: 63, multiplier: 7.26 }, { celsius: 64, multiplier: 7.58 }, { celsius: 65, multiplier: 7.9 },
  { celsius: 66, multiplier: 8.32 }, { celsius: 67, multiplier: 8.74 }, { celsius: 68, multiplier: 9.16 }, { celsius: 69, multiplier: 9.58 }, { celsius: 70, multiplier: 10 },
  { celsius: 71, multiplier: 10.52 }, { celsius: 72, multiplier: 11.04 }, { celsius: 73, multiplier: 11.56 }, { celsius: 74, multiplier: 12.08 }, { celsius: 75, multiplier: 12.6 },
  { celsius: 76, multiplier: 13.24 }, { celsius: 77, multiplier: 13.88 }, { celsius: 78, multiplier: 14.52 }, { celsius: 79, multiplier: 15.16 }, { celsius: 80, multiplier: 15.8 },
  { celsius: 81, multiplier: 16.64 }, { celsius: 82, multiplier: 17.48 }, { celsius: 83, multiplier: 18.32 }, { celsius: 84, multiplier: 19.16 }, { celsius: 85, multiplier: 20 },
  { celsius: 86, multiplier: 21.04 }, { celsius: 87, multiplier: 22.08 }, { celsius: 88, multiplier: 23.12 }, { celsius: 89, multiplier: 24.16 }, { celsius: 90, multiplier: 25.2 },
  { celsius: 91, multiplier: 26.45 }, { celsius: 92, multiplier: 27.7 }, { celsius: 93, multiplier: 28.95 }, { celsius: 94, multiplier: 30.2 }, { celsius: 95, multiplier: 31.6 },
  { celsius: 96, multiplier: 33.28 }, { celsius: 97, multiplier: 34.96 }, { celsius: 98, multiplier: 36.64 }, { celsius: 99, multiplier: 38.32 }, { celsius: 100, multiplier: 40 },
  { celsius: 101, multiplier: 42.08 }, { celsius: 102, multiplier: 44.16 }, { celsius: 103, multiplier: 46.24 }, { celsius: 104, multiplier: 48.32 }, { celsius: 105, multiplier: 50.4 },
  { celsius: 106, multiplier: 52.96 }, { celsius: 107, multiplier: 55.52 }, { celsius: 108, multiplier: 58.08 }, { celsius: 109, multiplier: 60.64 }, { celsius: 110, multiplier: 63.2 }
];

const getTCF = (celsius: number): number => {
  // Find exact match first
  const exactMatch = tcfData.find(data => data.celsius === celsius);
  if (exactMatch) {
    return exactMatch.multiplier; // Return exact value from table
  }

  // If no exact match, interpolate between surrounding values
  // Sort by Celsius to find neighbors
  const sortedTable = [...tcfData].sort((a, b) => a.celsius - b.celsius);
  let lowerBound: { celsius: number; multiplier: number } | null = null;
  let upperBound: { celsius: number; multiplier: number } | null = null;

  for (const entry of sortedTable) {
    if (entry.celsius < celsius) {
      lowerBound = entry;
    } else if (entry.celsius > celsius) {
      upperBound = entry;
      break;
    }
  }

  if (lowerBound && upperBound) {
    // Linear interpolation: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
    const interpolatedMultiplier = lowerBound.multiplier + (celsius - lowerBound.celsius) * 
                                  (upperBound.multiplier - lowerBound.multiplier) / 
                                  (upperBound.celsius - lowerBound.celsius);
    return interpolatedMultiplier;
  } else if (lowerBound) { // Celsius is above the highest table value
    return lowerBound.multiplier; // Extrapolate or return closest
  } else if (upperBound) { // Celsius is below the lowest table value
    return upperBound.multiplier; // Extrapolate or return closest
  }

  return 1.0; // Default if no data or single point
};

// Dropdown options
const visualInspectionResultOptions = [
  "Select One", "Satisfactory", "Unsatisfactory", "Cleaned", "See Comments", "Not Applicable"
];
const insulationResistanceUnitOptions = [
  { symbol: "kΩ", name: "Kilo-Ohms" }, { symbol: "MΩ", name: "Mega-Ohms" }, { symbol: "GΩ", name: "Giga-Ohms" }
];
const insulationTestVoltageOptions = ["Select One", "250V", "500V", "1000V", "2500V", "5000V"];
const fuseResistanceUnitOptions = [
  { symbol: "µΩ", name: "Micro-Ohms" }, { symbol: "mΩ", name: "Milli-Ohms" }, { symbol: "Ω", name: "Ohms" }
];
const passFailNaOptions = ["Select One", "Pass", "Fail", "N/A"];

interface TestEquipmentItem {
  name: string;
  serialNumber: string;
  ampId: string;
}

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

  // Device Data
  deviceData: {
    manufacturer: string;
    catalogNumber: string;
    serialNumber: string;
    accuracyClass: string;
    manufacturedYear: string;
    voltageRating: string;
    insulationClass: string;
    frequency: string;
  };

  // Visual and Mechanical Inspection
  visualMechanicalInspection: Array<{
    netaSection: string;
    description: string;
    result: string;
  }>;

  // Fuse Data
  fuseData: {
    manufacturer: string;
    catalogNumber: string;
    class: string;
    voltageRatingKv: string;
    ampacityA: string;
    icRatingKa: string;
  };

  // Electrical Tests - Fuse Resistance
  fuseResistanceTest: {
    asFound: string;
    asLeft: string;
    units: string;
  };

  // Electrical Tests - Insulation Resistance & Ratio
  insulationResistance: Array<{
    id: string;
    windingTested: string;
    testVoltage: string;
    results: string;
    units: string;
    correctedResults: string; // For temperature corrected values
  }>;
  secondaryVoltageAsFoundTap: string;
  turnsRatioTest: Array<{
    id: string;
    tap: string;
    primaryVoltage: string;
    calculatedRatio: string;
    measuredH1H2: string;
    percentDeviation: string;
    passFail: string;
  }>;

  // Test Equipment Used
  testEquipmentUsed: {
    megohmmeter: TestEquipmentItem;
    lowResistanceOhmmeter: TestEquipmentItem;
    ttrTestSet: TestEquipmentItem;
  };

  comments: string;
  status: string; // PASS, FAIL
}

const calculateTempCorrectedReading = (reading: string, tcf: number): string => {
  const numericReading = parseFloat(reading);
  if (isNaN(numericReading) || !reading.trim()) return '';
  return (numericReading * tcf).toFixed(2);
};

const VoltagePotentialTransformerTestMTSReport: React.FC = () => {
  const { id: jobId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(!reportId);
  
  // Determine which report type this is based on the URL path
  const currentPath = location.pathname;
  const reportSlug = '13-voltage-potential-transformer-test-mts-report'; // This component handles the 13-voltage-potential-transformer-test-mts-report route
  const reportName = getReportName(reportSlug);

  const initialVisualInspectionItems = [
    { netaSection: '7.10.2.1', description: 'Inspect physical and mechanical condition.', result: 'Select One' },
    { netaSection: '7.10.2.3', description: 'Clean the unit.', result: 'Select One' },
    { netaSection: '7.10.2.4', description: 'Use of a low-resistance ohmmeter in accordance with Section 7.10.1.B.1.', result: 'Select One' },
    { netaSection: '7.10.2.5', description: 'Verify that all required grounding and connections provide contact.', result: 'Select One' },
    { netaSection: '7.10.2.6', description: 'Verify correct operation of transformer withdrawal mechanism and grounding operation.', result: 'Select One' },
    { netaSection: '7.10.2.7', description: 'Verify correct primary and secondary fuse sizes for voltage transformers.', result: 'Select One' },
    { netaSection: '7.10.2.8', description: 'Use appropriate lubrication on moving current-carrying parts and on moving and sliding surfaces.', result: 'Select One' },
  ];

  const initialInsulationResistanceItems = [
    { id: 'ir-primary-gnd', windingTested: 'Primary to Ground', testVoltage: '', results: '', units: 'MΩ', correctedResults: '' },
    { id: 'ir-secondary-gnd', windingTested: 'Secondary to Ground', testVoltage: '', results: '', units: 'MΩ', correctedResults: '' },
    { id: 'ir-primary-secondary', windingTested: 'Primary to Secondary', testVoltage: '', results: '', units: 'MΩ', correctedResults: '' },
  ];
  
  const initialTurnsRatioTestItems = [
    { id: 'tr-0', tap: '', primaryVoltage: '', calculatedRatio: '', measuredH1H2: '', percentDeviation: '', passFail: 'Select One' }
  ];


  const [formData, setFormData] = useState<FormData>({
    customerName: '',
    customerAddress: '',
    userName: user?.email || '',
    date: new Date().toISOString().split('T')[0],
    identifier: '',
    jobNumber: '',
    technicians: '',
    temperature: { fahrenheit: 76, celsius: 24, tcf: 1.2, humidity: 0 }, // Default based on image
    substation: '',
    eqptLocation: '',
    deviceData: {
      manufacturer: '', catalogNumber: '', serialNumber: '', accuracyClass: '',
      manufacturedYear: '', voltageRating: '', insulationClass: '', frequency: ''
    },
    visualMechanicalInspection: initialVisualInspectionItems,
    fuseData: {
      manufacturer: '', catalogNumber: '', class: '', voltageRatingKv: '', ampacityA: '', icRatingKa: ''
    },
    fuseResistanceTest: { asFound: '', asLeft: '', units: 'µΩ' },
    insulationResistance: initialInsulationResistanceItems,
    secondaryVoltageAsFoundTap: '120', // Default based on image
    turnsRatioTest: initialTurnsRatioTestItems,
    testEquipmentUsed: {
      megohmmeter: { name: '', serialNumber: '', ampId: '' },
      lowResistanceOhmmeter: { name: '', serialNumber: '', ampId: '' },
      ttrTestSet: { name: '', serialNumber: '', ampId: '' },
    },
    comments: '',
    status: 'PASS',
  });

  // Load job information
  const loadJobInfo = async () => {
    if (!jobId) return;
    
    try {
      setLoading(true);
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select(`title, job_number, customer_id`)
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

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
            customerName: customerData.company_name || customerData.name || '',
            customerAddress: customerData.address || '',
            jobNumber: jobData.job_number || ''
          }));
        }
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      // alert(`Failed to load job info: ${(error as Error).message}`);
    } finally {
      // setLoading(false) is handled in loadReport or if no reportId
    }
  };

  // Load existing report
  const loadReport = async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      // setLoading(true) is already called in loadJobInfo or will be called here
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('voltage_potential_transformer_mts_reports') // Ensure this is the correct table name
        .select('*')
        .eq('id', reportId)
        .single();
      
      if (error) throw error;
      
      if (data && data.report_data) {
         // Ensure all parts of formData are updated, especially arrays
        setFormData(prev => ({
          ...prev, // Keep previous defaults if some fields are missing
          ...data.report_data,
          // Explicitly set array fields if they might be missing or need merging
          visualMechanicalInspection: data.report_data.visualMechanicalInspection || initialVisualInspectionItems,
          insulationResistance: data.report_data.insulationResistance || initialInsulationResistanceItems,
          turnsRatioTest: data.report_data.turnsRatioTest || initialTurnsRatioTestItems,
          // Ensure nested objects like temperature and deviceData are spread correctly
          temperature: { ...prev.temperature, ...data.report_data.temperature },
          deviceData: { ...prev.deviceData, ...data.report_data.deviceData },
          fuseData: { ...prev.fuseData, ...data.report_data.fuseData },
          fuseResistanceTest: { ...prev.fuseResistanceTest, ...data.report_data.fuseResistanceTest },
          testEquipmentUsed: { ...prev.testEquipmentUsed, ...data.report_data.testEquipmentUsed },
        }));
        setIsEditing(false);
      } else {
        setIsEditing(true); // If no data, go into edit mode for a new report
      }
    } catch (error) {
      console.error('Error loading report:', error);
      // alert(`Failed to load report: ${(error as Error).message}`);
      setIsEditing(true); // If error, allow editing
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadJobInfo(); // Always load job info
    if (reportId) {
      loadReport(); // Load report only if reportId exists
    } else {
      setLoading(false); // No report to load, finish loading
      setIsEditing(true); // New report, start in edit mode
    }
  }, [jobId, reportId, user]);


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
    setFormData(prev => {
      const updatedForm = _.set({ ...prev }, path, value);
      
      // Recalculate corrected insulation resistance if relevant fields change
      if (path.startsWith('insulationResistance') || path === 'temperature.tcf') {
        const newInsulationResistance = updatedForm.insulationResistance.map((item: any) => ({
          ...item,
          correctedResults: calculateTempCorrectedReading(item.results, updatedForm.temperature.tcf)
        }));
        updatedForm.insulationResistance = newInsulationResistance;
      }
      
      // Recalculate turns ratio deviation if relevant fields change
      if (path.startsWith('turnsRatioTest') || path === 'secondaryVoltageAsFoundTap') {
        if (updatedForm.turnsRatioTest && updatedForm.turnsRatioTest.length > 0) {
            const item = updatedForm.turnsRatioTest[0];
            const primaryVoltage = parseFloat(item.primaryVoltage);
            const secondaryVoltage = parseFloat(updatedForm.secondaryVoltageAsFoundTap);
            const measuredH1H2 = parseFloat(item.measuredH1H2);
            let calculatedRatio = '';
            let percentDeviation = '';
            let passFail = item.passFail; // Preserve existing or default

            if (!isNaN(primaryVoltage) && !isNaN(secondaryVoltage) && secondaryVoltage !== 0) {
                const calcRatioVal = primaryVoltage / secondaryVoltage;
                calculatedRatio = calcRatioVal.toFixed(4);
                if (!isNaN(measuredH1H2)) {
                    const dev = ((calcRatioVal - measuredH1H2) / calcRatioVal) * 100;
                    percentDeviation = dev.toFixed(2);
                    
                    const devNum = parseFloat(percentDeviation);
                    if (percentDeviation === '') {
                        passFail = ''; // Empty string if deviation is blank
                    } else if (!isNaN(devNum) && devNum > -0.501 && devNum < 0.501) {
                        passFail = 'Pass';
                    } else {
                        passFail = 'Fail';
                    }
                } else {
                     passFail = ''; // Empty string if measuredH1H2 is not a number
                }
            } else {
                 passFail = ''; // Empty string if calculation is not possible
            }
            updatedForm.turnsRatioTest = [{ ...item, calculatedRatio, percentDeviation, passFail }];
        }
      }
      return updatedForm;
    });
  };
  
  const handleVisualInspectionChange = (index: number, field: keyof FormData['visualMechanicalInspection'][0], value: string) => {
    setFormData(prev => {
      const newItems = [...prev.visualMechanicalInspection];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, visualMechanicalInspection: newItems };
    });
  };

  const handleInsulationResistanceChange = (index: number, field: keyof FormData['insulationResistance'][0], value: string) => {
     handleChange(`insulationResistance[${index}].${field}`, value);
  };
  
  const handleTurnsRatioChange = (field: keyof FormData['turnsRatioTest'][0], value: string) => {
    handleChange(`turnsRatioTest[0].${field}`, value);
  };
  
  // Save report
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditing) return;

    // Recalculate all corrected values and deviations before saving
    const finalFormData = _.cloneDeep(formData);
    finalFormData.insulationResistance = finalFormData.insulationResistance.map(item => ({
      ...item,
      correctedResults: calculateTempCorrectedReading(item.results, finalFormData.temperature.tcf)
    }));
    if (finalFormData.turnsRatioTest && finalFormData.turnsRatioTest.length > 0) {
        const item = finalFormData.turnsRatioTest[0];
        const primaryVoltage = parseFloat(item.primaryVoltage);
        const secondaryVoltage = parseFloat(finalFormData.secondaryVoltageAsFoundTap);
        const measuredH1H2 = parseFloat(item.measuredH1H2);
        let calculatedRatio = '';
        let percentDeviation = '';
        let passFail = item.passFail; // Preserve existing or default

        if (!isNaN(primaryVoltage) && !isNaN(secondaryVoltage) && secondaryVoltage !== 0) {
            const calcRatioVal = primaryVoltage / secondaryVoltage;
            calculatedRatio = calcRatioVal.toFixed(4);
            if (!isNaN(measuredH1H2)) {
                const dev = ((calcRatioVal - measuredH1H2) / calcRatioVal) * 100;
                percentDeviation = dev.toFixed(2);

                const devNum = parseFloat(percentDeviation);
                if (percentDeviation === '') {
                    passFail = ''; // Empty string if deviation is blank
                } else if (!isNaN(devNum) && devNum > -0.501 && devNum < 0.501) {
                    passFail = 'Pass';
                } else {
                    passFail = 'Fail';
                }
            } else {
                 passFail = ''; // Empty string if measuredH1H2 is not a number
            }
        } else {
            passFail = ''; // Empty string if calculation is not possible
        }
        finalFormData.turnsRatioTest = [{ ...item, calculatedRatio, percentDeviation, passFail }];
    }


    const reportPayload = {
      job_id: jobId,
      user_id: user.id,
      report_data: finalFormData
    };

    try {
      let result;
      if (reportId) {
        result = await supabase
          .schema('neta_ops')
          .from('voltage_potential_transformer_mts_reports')
          .update(reportPayload)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        result = await supabase
          .schema('neta_ops')
          .from('voltage_potential_transformer_mts_reports')
          .insert(reportPayload)
          .select()
          .single();

        if (result.data) {
          const assetData = {
            name: getAssetName(reportSlug, formData.identifier || formData.eqptLocation || ''),
            file_url: `report:/jobs/${jobId}/13-voltage-potential-transformer-test-mts-report/${result.data.id}`,
            user_id: user.id,
            template_type: 'MTS' // Or a more specific type if needed
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

  if (loading) return <div className="p-4 dark:text-white">Loading...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{reportName}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (isEditing) handleChange('status', formData.status === 'PASS' ? 'FAIL' : 'PASS')
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
            <button onClick={() => setIsEditing(true)} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Edit Report
            </button>
          ) : (
            <button onClick={handleSave} disabled={!isEditing} className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditing ? 'hidden' : 'hover:bg-orange-700'}`}>
              Save Report
            </button>
          )}
        </div>
      </div>

      {/* Job Information Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Job Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <div><label className="form-label">Customer:</label><input type="text" value={formData.customerName} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
            <div><label className="form-label">Job #:</label><input type="text" value={formData.jobNumber} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-full" /></div>
            <div><label htmlFor="technicians" className="form-label">Technicians:</label><input id="technicians" type="text" value={formData.technicians} onChange={(e) => handleChange('technicians', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="date" className="form-label">Date:</label><input id="date" type="date" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="identifier" className="form-label">Identifier:</label><input id="identifier" type="text" value={formData.identifier} onChange={(e) => handleChange('identifier', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div className="flex items-center space-x-2">
              <div>
                <label htmlFor="temperature.fahrenheit" className="form-label">Temp:</label>
                <input id="temperature.fahrenheit" type="number" value={formData.temperature.fahrenheit} onChange={(e) => handleFahrenheitChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                <span className="ml-1">°F</span>
              </div>
              <div>
                <label htmlFor="temperature.celsius" className="form-label sr-only">Celsius</label>
                <input id="temperature.celsius" type="number" value={formData.temperature.celsius} onChange={(e) => handleCelsiusChange(Number(e.target.value))} readOnly={!isEditing} className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                <span className="ml-1">°C</span>
              </div>
            </div>
            <div><label htmlFor="temperature.tcf" className="form-label">TCF:</label><input id="temperature.tcf" type="number" value={formData.temperature.tcf} readOnly className="form-input bg-gray-100 dark:bg-dark-200 w-20" /></div>
            <div><label htmlFor="temperature.humidity" className="form-label">Humidity:</label><input id="temperature.humidity" type="number" value={formData.temperature.humidity} onChange={(e) => handleChange('temperature.humidity', Number(e.target.value))} readOnly={!isEditing} className={`form-input w-20 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /><span className="ml-1">%</span></div>
            <div><label htmlFor="substation" className="form-label">Substation:</label><input id="substation" type="text" value={formData.substation} onChange={(e) => handleChange('substation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="eqptLocation" className="form-label">Eqpt. Location:</label><input id="eqptLocation" type="text" value={formData.eqptLocation} onChange={(e) => handleChange('eqptLocation', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div className="md:col-span-2 lg:col-span-1"><label htmlFor="user" className="form-label">User:</label><input id="user" type="text" value={formData.userName} onChange={(e) => handleChange('userName', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
        </div>
      </section>

      {/* Device Data Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Device Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            <div><label htmlFor="deviceData.manufacturer" className="form-label">Manufacturer:</label><input id="deviceData.manufacturer" type="text" value={formData.deviceData.manufacturer} onChange={(e) => handleChange('deviceData.manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.catalogNumber" className="form-label">Catalog Number:</label><input id="deviceData.catalogNumber" type="text" value={formData.deviceData.catalogNumber} onChange={(e) => handleChange('deviceData.catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.serialNumber" className="form-label">Serial Number:</label><input id="deviceData.serialNumber" type="text" value={formData.deviceData.serialNumber} onChange={(e) => handleChange('deviceData.serialNumber', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.accuracyClass" className="form-label">Accuracy Class:</label><input id="deviceData.accuracyClass" type="text" value={formData.deviceData.accuracyClass} onChange={(e) => handleChange('deviceData.accuracyClass', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.manufacturedYear" className="form-label">Manufactured Year:</label><input id="deviceData.manufacturedYear" type="text" value={formData.deviceData.manufacturedYear} onChange={(e) => handleChange('deviceData.manufacturedYear', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.voltageRating" className="form-label">Voltage Rating:</label><input id="deviceData.voltageRating" type="text" value={formData.deviceData.voltageRating} onChange={(e) => handleChange('deviceData.voltageRating', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.insulationClass" className="form-label">Insulation Class:</label><input id="deviceData.insulationClass" type="text" value={formData.deviceData.insulationClass} onChange={(e) => handleChange('deviceData.insulationClass', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="deviceData.frequency" className="form-label">Frequency:</label><input id="deviceData.frequency" type="text" value={formData.deviceData.frequency} onChange={(e) => handleChange('deviceData.frequency', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
        </div>
      </section>

      {/* Visual and Mechanical Inspection Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual and Mechanical Inspection</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-dark-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">NETA Section</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
              {formData.visualMechanicalInspection.map((item, index) => (
                <tr key={item.netaSection}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{item.netaSection}</td>
                  <td className="px-6 py-4 text-sm">{item.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select value={item.result} onChange={(e) => handleVisualInspectionChange(index, 'result', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                      {visualInspectionResultOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Fuse Data Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Fuse Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <div><label htmlFor="fuseData.manufacturer" className="form-label">Manufacturer:</label><input id="fuseData.manufacturer" type="text" value={formData.fuseData.manufacturer} onChange={(e) => handleChange('fuseData.manufacturer', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="fuseData.catalogNumber" className="form-label">Catalog Number:</label><input id="fuseData.catalogNumber" type="text" value={formData.fuseData.catalogNumber} onChange={(e) => handleChange('fuseData.catalogNumber', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="fuseData.class" className="form-label">Class:</label><input id="fuseData.class" type="text" value={formData.fuseData.class} onChange={(e) => handleChange('fuseData.class', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="fuseData.voltageRatingKv" className="form-label">Voltage Rating (kV):</label><input id="fuseData.voltageRatingKv" type="text" value={formData.fuseData.voltageRatingKv} onChange={(e) => handleChange('fuseData.voltageRatingKv', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="fuseData.ampacityA" className="form-label">Ampacity (A):</label><input id="fuseData.ampacityA" type="text" value={formData.fuseData.ampacityA} onChange={(e) => handleChange('fuseData.ampacityA', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
            <div><label htmlFor="fuseData.icRatingKa" className="form-label">I.C. Rating (kA):</label><input id="fuseData.icRatingKa" type="text" value={formData.fuseData.icRatingKa} onChange={(e) => handleChange('fuseData.icRatingKa', e.target.value)} readOnly={!isEditing} className={`form-input ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
        </div>
      </section>
      
      {/* Electrical Tests - Fuse Resistance Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Fuse Resistance</h2>
        <div className="overflow-x-auto">
            <table className="min-w-full w-max divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-dark-200">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fuse Resistance</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">As Found</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">As Left</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">Fuse Resistance</td>
                        <td className="px-6 py-4"><input type="text" value={formData.fuseResistanceTest.asFound} onChange={(e) => handleChange('fuseResistanceTest.asFound', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                        <td className="px-6 py-4"><input type="text" value={formData.fuseResistanceTest.asLeft} onChange={(e) => handleChange('fuseResistanceTest.asLeft', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                        <td className="px-6 py-4">
                            <select value={formData.fuseResistanceTest.units} onChange={(e) => handleChange('fuseResistanceTest.units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                {fuseResistanceUnitOptions.map(opt => <option key={opt.symbol} value={opt.symbol}>{opt.symbol}</option>)}
                            </select>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
      </section>

      {/* Electrical Tests - Insulation Resistance & Ratio Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Electrical Tests - Insulation Resistance & Ratio</h2>
        
        {/* Insulation Resistance Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Insulation Resistance</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-dark-200">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Winding Tested</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Test Voltage</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                            {formData.insulationResistance.map((item, index) => (
                                <tr key={item.id}>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">{item.windingTested}</td>
                                    <td className="px-3 py-2">
                                        <select value={item.testVoltage} onChange={(e) => handleInsulationResistanceChange(index, 'testVoltage', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                            {insulationTestVoltageOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-3 py-2"><input type="text" value={item.results} onChange={(e) => handleInsulationResistanceChange(index, 'results', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                    <td className="px-3 py-2">
                                        <select value={item.units} onChange={(e) => handleInsulationResistanceChange(index, 'units', e.target.value)} disabled={!isEditing} className={`form-select w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}>
                                            {insulationResistanceUnitOptions.map(opt => <option key={opt.symbol} value={opt.symbol}>{opt.symbol}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Temperature Corrected Table */}
            <div>
                <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Temperature Corrected</h3>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-dark-200">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Winding Tested</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Test Voltage</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Results</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                            {formData.insulationResistance.map((item) => (
                                <tr key={`corrected-${item.id}`}>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">{item.windingTested}</td>
                                    <td className="px-3 py-2"><input type="text" value={item.testVoltage} readOnly className="form-input w-full bg-gray-100 dark:bg-dark-200" /></td>
                                    <td className="px-3 py-2"><input type="text" value={item.correctedResults} readOnly className="form-input w-full bg-gray-100 dark:bg-dark-200" /></td>
                                    <td className="px-3 py-2"><input type="text" value={item.units} readOnly className="form-input w-full bg-gray-100 dark:bg-dark-200" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        {/* Secondary Voltage and Turns Ratio Test */}
        <div>
            <div className="mb-4">
                <label htmlFor="secondaryVoltageAsFoundTap" className="form-label inline-block mr-2">Secondary Voltage at as-found tap:</label>
                <input id="secondaryVoltageAsFoundTap" type="text" value={formData.secondaryVoltageAsFoundTap} onChange={(e) => handleChange('secondaryVoltageAsFoundTap', e.target.value)} readOnly={!isEditing} className={`form-input inline-block w-24 ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} />
                <span className="ml-2">V</span>
            </div>

            <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-100">Turns Ratio Test</h3>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-dark-200">
                        <tr>
                            {['Tap', 'Primary Voltage', 'Calculated Ratio', 'Measured H1-H2', '% Dev.', 'Pass/Fail'].map(header => (
                                <th key={header} className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                        {formData.turnsRatioTest && formData.turnsRatioTest.length > 0 && (
                            <tr>
                                <td className="px-2 py-2"><input type="text" value={formData.turnsRatioTest[0].tap} onChange={(e) => handleTurnsRatioChange('tap', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="px-2 py-2"><input type="text" value={formData.turnsRatioTest[0].primaryVoltage} onChange={(e) => handleTurnsRatioChange('primaryVoltage', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="px-2 py-2"><input type="text" value={formData.turnsRatioTest[0].calculatedRatio} readOnly className="form-input w-full bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="px-2 py-2"><input type="text" value={formData.turnsRatioTest[0].measuredH1H2} onChange={(e) => handleTurnsRatioChange('measuredH1H2', e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></td>
                                <td className="px-2 py-2"><input type="text" value={formData.turnsRatioTest[0].percentDeviation} readOnly className="form-input w-full bg-gray-100 dark:bg-dark-200" /></td>
                                <td className="px-2 py-2">
                                    <input type="text" value={formData.turnsRatioTest[0].passFail} readOnly className="form-input w-full bg-gray-100 dark:bg-dark-200" />
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </section>

      {/* Test Equipment Used Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
        <div className="space-y-4">
            {(Object.keys(formData.testEquipmentUsed) as Array<keyof FormData['testEquipmentUsed']>).map(equipmentKey => {
                const equipment = formData.testEquipmentUsed[equipmentKey];
                const label = equipmentKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
                    .replace('Megohmmeter', 'Megohmmeter')
                    .replace('Low Resistance Ohmmeter', 'Low Resistance Ohmmeter')
                    .replace('Ttr Test Set', 'TTR Test Set');

                return (
                    <div key={equipmentKey} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div><label htmlFor={`${equipmentKey}Name`} className="form-label block">{label}:</label><input id={`${equipmentKey}Name`} type="text" value={equipment.name} onChange={(e) => handleChange(`testEquipmentUsed.${equipmentKey}.name`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                        <div><label htmlFor={`${equipmentKey}Serial`} className="form-label block">Serial Number:</label><input id={`${equipmentKey}Serial`} type="text" value={equipment.serialNumber} onChange={(e) => handleChange(`testEquipmentUsed.${equipmentKey}.serialNumber`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                        <div><label htmlFor={`${equipmentKey}AmpId`} className="form-label block">AMP ID:</label><input id={`${equipmentKey}AmpId`} type="text" value={equipment.ampId} onChange={(e) => handleChange(`testEquipmentUsed.${equipmentKey}.ampId`, e.target.value)} readOnly={!isEditing} className={`form-input w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`} /></div>
                    </div>
                );
            })}
        </div>
      </section>

      {/* Comments Section */}
      <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
        <textarea
          value={formData.comments}
          onChange={(e) => handleChange('comments', e.target.value)}
          readOnly={!isEditing}
          rows={6}
          className={`form-textarea w-full ${!isEditing ? 'bg-gray-100 dark:bg-dark-200' : ''}`}
          placeholder="Enter comments here..."
        />
      </section>
    </div>
  );
};

export default VoltagePotentialTransformerTestMTSReport; 