/**
 * Standardized Report Template
 * 
 * This template demonstrates the standardized structure and patterns that all reports should follow.
 * Use this as a reference when creating new reports or refactoring existing ones.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import {
  BaseReportData,
  StandardReportRecord,
  StandardNameplateData,
  StandardVisualInspection,
  VisualInspectionItem,
  ReportType,
  STANDARD_DROPDOWN_OPTIONS,
  createStandardJobInfo,
  createStandardEnvironmental,
  createStandardMetadata,
  validateReportStructure
} from '../../types/standardReportStructure';

// Equipment-specific interfaces extend the standard structure
interface EquipmentSpecificData {
  // Add equipment-specific fields here
  // Example for a transformer:
  // turnsRatioTests?: TurnsRatioTest[];
  // windingResistance?: WindingResistanceTest[];
}

interface StandardReportFormData extends BaseReportData {
  // Equipment-specific data
  equipmentData?: EquipmentSpecificData;
}

// Constants
const REPORT_TYPE: ReportType = 'switchgear'; // Change this for each report type
const TABLE_NAME = 'standard_reports'; // Change this for each report type
const REPORT_ROUTE = 'standard-report'; // Change this for each report type

// Standard visual inspection items (customize for each equipment type)
const STANDARD_VISUAL_INSPECTION_ITEMS: VisualInspectionItem[] = [
  {
    netaSection: '7.1.A.1',
    description: 'Compare equipment nameplate data with drawings and specifications.',
    result: 'Select One'
  },
  {
    netaSection: '7.1.A.2',
    description: 'Inspect physical and mechanical condition.',
    result: 'Select One'
  },
  // Add more items as needed for specific equipment
];

// Map generic report types to their NETA standard (right-side header)
const REPORT_STANDARDS_BY_TYPE: Record<ReportType, string> = {
  // ATS defaults for generic templates
  switchgear: 'ATS 7.1',
  panelboard: 'ATS 7.1',
  dry_type_transformer: 'ATS 7.2.1.1',
  large_dry_type_transformer: 'ATS 7.2.1.1',
  liquid_filled_transformer: 'ATS 7.2.1.1',
  oil_transformer: 'ATS 7.2.1.1',
  medium_voltage_cable: 'ATS 7.3.3',
  low_voltage_cable: 'ATS 7.2.1.1',
  circuit_breaker: 'ATS 7.6.1.2', // default to LV CB; adjust per specific report if needed
  current_transformer: 'ATS 7.10.1',
  voltage_transformer: 'ATS 7.10.2',
  motor_starter: 'MTS 7.16.1.2',
  automatic_transfer_switch: 'ATS 7.22.3',
};

const StandardReportTemplate: React.FC = () => {
  const { jobId, reportId } = useParams<{ jobId: string; reportId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State management
  const [isEditMode, setIsEditMode] = useState<boolean>(!reportId);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Form data with standardized structure
  const [formData, setFormData] = useState<StandardReportFormData>({
    jobInfo: createStandardJobInfo(),
    environmental: createStandardEnvironmental(),
    metadata: createStandardMetadata(REPORT_TYPE),
    comments: '',
    equipmentData: {}
  });

  // Standardized sections
  const [nameplateData, setNameplateData] = useState<StandardNameplateData>({
    manufacturer: '',
    catalogNumber: '',
    serialNumber: '',
    type: '',
    manufacturingDate: ''
  });

  const [visualInspection, setVisualInspection] = useState<StandardVisualInspection>({
    items: JSON.parse(JSON.stringify(STANDARD_VISUAL_INSPECTION_ITEMS)),
    generalComments: ''
  });

  // Load job information
  const loadJobInfo = useCallback(async () => {
    if (!jobId) return;

    try {
      // Load job data
      const { data: jobData, error: jobError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .select('title, job_number, customer_id')
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      // Load customer data
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
            jobInfo: {
              ...prev.jobInfo,
              customer: customerData.name || customerData.company_name || '',
              address: customerData.address || '',
              jobNumber: jobData.job_number || ''
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error loading job info:', error);
      setError(`Failed to load job info: ${(error as Error).message}`);
    }
  }, [jobId]);

  // Load existing report
  const loadReport = useCallback(async () => {
    if (!reportId) {
      setLoading(false);
      setIsEditMode(true);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema('neta_ops')
        .from(TABLE_NAME)
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;

      if (data) {
        // Validate the report structure
        const validation = validateReportStructure(data, REPORT_TYPE);
        if (!validation.isValid) {
          console.warn('Report structure validation failed:', validation.errors);
        }

        // Load standardized data
        setFormData(prev => ({
          ...prev,
          ...data.report_info,
          equipmentData: data.equipment_specific || {}
        }));

        if (data.nameplate_data) {
          setNameplateData(data.nameplate_data);
        }

        if (data.visual_inspection) {
          setVisualInspection(data.visual_inspection);
        }

        setIsEditMode(false);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      setError(`Failed to load report: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  // Initialize component
  useEffect(() => {
    loadJobInfo();
    loadReport();
  }, [loadJobInfo, loadReport]);

  // Handle form field changes
  const handleJobInfoChange = (field: keyof BaseReportData['jobInfo'], value: string) => {
    setFormData(prev => ({
      ...prev,
      jobInfo: {
        ...prev.jobInfo,
        [field]: value
      }
    }));
  };

  const handleEnvironmentalChange = (field: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      environmental: {
        ...prev.environmental,
        temperature: {
          ...prev.environmental.temperature,
          [field]: value
        }
      }
    }));
  };

  const handleNameplateChange = (field: keyof StandardNameplateData, value: string) => {
    setNameplateData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleVisualInspectionChange = (index: number, field: keyof VisualInspectionItem, value: string) => {
    setVisualInspection(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleStatusChange = () => {
    setFormData(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        status: prev.metadata.status === 'PASS' ? 'FAIL' : 'PASS'
      }
    }));
  };

  // Save report
  const handleSave = async () => {
    if (!jobId || !user?.id || !isEditMode) return;

    try {
      setSaving(true);

      // Build standardized report record
      const reportRecord: Omit<StandardReportRecord, 'id' | 'created_at' | 'updated_at'> = {
        job_id: jobId,
        user_id: user.id,
        report_info: formData,
        nameplate_data: nameplateData,
        visual_inspection: visualInspection,
        equipment_specific: formData.equipmentData
      };

      let result;
      if (reportId) {
        // Update existing report
        result = await supabase
          .schema('neta_ops')
          .from(TABLE_NAME)
          .update(reportRecord)
          .eq('id', reportId)
          .select()
          .single();
      } else {
        // Create new report
        result = await supabase
          .schema('neta_ops')
          .from(TABLE_NAME)
          .insert(reportRecord)
          .select()
          .single();

        // Create asset entry
        if (result.data) {
          const assetData = {
            name: `${REPORT_TYPE} Report - ${formData.jobInfo.identifier || formData.jobInfo.eqptLocation || 'Unnamed'}`,
            file_url: `report:/jobs/${jobId}/${REPORT_ROUTE}/${result.data.id}`,
            user_id: user.id
          };

          const { data: assetResult, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert(assetData)
            .select()
            .single();

          if (assetError) throw assetError;

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
      }

      if (result.error) throw result.error;

      setIsEditMode(false);
      alert(`Report ${reportId ? 'updated' : 'saved'} successfully!`);
      navigate(`/jobs/${jobId}`);
    } catch (error: any) {
      console.error('Error saving report:', error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading report...</div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 flex justify-center">
      <div className="max-w-7xl w-full space-y-6">
        {/* Print Header - Only visible when printing */}
        <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 40 }} />
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold text-black mb-1">Standard Report Template</h1>
          </div>
          <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c' }}>
            {`NETA - ${REPORT_STANDARDS_BY_TYPE[REPORT_TYPE] || 'ATS 7.1'}`}
          </div>
        </div>

        {/* On-screen heading */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Standard Report Template
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          This is a template component. Use the standardized structure defined in 
          src/types/standardReportStructure.ts when creating new reports.
        </p>
      </div>
    </div>
  );
};

export default StandardReportTemplate; 