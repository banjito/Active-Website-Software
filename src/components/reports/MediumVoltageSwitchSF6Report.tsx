import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import JobInfoPrintTable from './common/JobInfoPrintTable';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useDemoMode } from '@/lib/DemoModeContext';
import { EquipmentAutocomplete } from '../equipment/EquipmentAutocomplete';
import { formatLocalDateShort } from '@/utils/dateUtils';
import { getPassFailBadgeClass } from '@/lib/reportPassFailStatus';

type ResultOption = 'Select One' | 'Satisfactory' | 'Unsatisfactory' | 'Cleaned' | 'See Comments' | 'Not Applicable';

interface NameplateData {
  manufacturer: string;
  catalogNo: string;
  serialNumber: string;
  dateOfMfg: string;
  type: string;
  systemVoltage: string;
  ratedVoltage: string;
  ratedCurrent: string;
  aicRating: string;
  impulseLevelBIL: string;
  sf6GasMass: string;
}

interface VFIData {
  manufacturer: string;
  catalogNo: string;
  type: string;
  ratedVoltage: string;
  ratedCurrent: string;
  aicRating: string;
}

interface CounterReadingRow { identifier: string; asFound: string; asLeft: string }

interface InsulationRow {
  waySection: string;
  ag: string; bg: string; cg: string; ab: string; bc: string; ca: string;
  lineA: string; lineB: string; lineC: string;
  units: string;
}

interface ContactRow { waySection: string; aPhase: string; aG: string; bPhase: string; bG: string; cPhase: string; cG: string; units: string }

interface DielectricRow { waySection: string; ag: string; bg: string; cg: string; units: string }
interface DielectricVFIRow { vfiIdentifier: string; serialNumber: string; a: string; b: string; c: string; units: string }

interface EquipmentInfo { megohmmeter: { model: string; serial: string; ampId: string; calDate: string }; lowResOhmmeter: { model: string; serial: string; ampId: string; calDate: string }; hipot: { model: string; serial: string; ampId: string; calDate: string } }

interface ReportData {
  customer: string;
  address: string;
  user: string;
  date: string;
  jobNumber: string;
  technicians: string;
  identifier: string;
  substation: string;
  eqptLocation: string;
  temperature: number;
  humidity: number;
  // Sections
  nameplate: NameplateData;
  vfi: VFIData;
  visualInspection: Record<string, ResultOption>;
  counterReadings: CounterReadingRow[];
  insulationMeasured: { rows: InsulationRow[]; testVoltage: string };
  insulationCorrected: { rows: InsulationRow[]; testVoltage: string };
  contactResistance: { rows: ContactRow[] };
  dielectricWithstand: { rows: DielectricRow[]; testVoltage: string };
  dielectricVFI: { rows: DielectricVFIRow[]; testVoltage: string };
  equipment: EquipmentInfo;
  comments: string;
}

const INSPECTION_ITEMS: { id: string; description: string }[] = [
  { id: '7.5.4.A.1', description: 'Compare equipment nameplate data with drawings.' },
  { id: '7.5.4.A.2', description: 'Inspect physical and mechanical condition.' },
  { id: '7.5.4.A.3', description: 'Inspect anchorage, alignment, grounding, and required clearances.' },
  { id: '7.5.4.A.4', description: 'Verify the unit is clean.' },
  { id: '7.5.4.A.5', description: 'Inspect and service mechanical operator and SF6 gas insulated system in accordance with the manufacturer\'s published data.' },
  { id: '7.5.4.A.6', description: 'Verify correct operation of SF6 gas pressure alarms and limit switches, as recommended by the manufacturer.' },
  { id: '7.5.4.A.7', description: 'Measure critical distances as recommended by the manufacturer.' },
  { id: '7.5.4.A.8', description: 'Verify operation and sequencing of interlocking systems.' },
  { id: '7.5.4.A.9', description: 'Verify that each fuse holder has adequate mechanical support and contact integrity.' },
  { id: '7.5.4.A.10', description: 'Verify that fuse sizes and types are in accordance with drawings, short-circuit study, and manufacturer\'s data.' },
  { id: '7.5.4.A.12', description: 'Verify appropriate lubrication on moving, current-carrying parts and on moving and sliding surfaces.' },
  { id: '7.5.4.A.13', description: 'Test for SF6 gas leaks in accordance with manufacturer\'s published data.' },
];

const RESULT_OPTIONS: ResultOption[] = ['Select One', 'Satisfactory', 'Unsatisfactory', 'Cleaned', 'See Comments', 'Not Applicable'];
const TEST_VOLTAGE_IR = ['250V', '500V', '1000V', '2500V', '5000V'];
const IR_UNITS = ['kΩ', 'MΩ', 'GΩ'];
const CONTACT_UNITS = ['μΩ', 'mΩ', 'Ω'];
const DIELECTRIC_UNITS = ['μA', 'mA'];
const TEST_VOLTAGE_DW = [
  '1.6 kVAC', '2.2 kVAC', '14 kVAC', '25 kVAC', '27 kVAC', '30 kVAC', '37 kVAC', '45 kVAC', '60 kVAC', '120 kVAC',
  '2.3 kVDC', '3.1 kVDC', '20 kVDC', '30.5 kVDC', '37.5 kVDC'
];

const MediumVoltageSwitchSF6Report: React.FC = () => {
  const { id: jobId, reportId: initialReportId } = useParams<{ id: string; reportId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { maskCustomerName, maskCustomerAddress } = useDemoMode();

  const [currentReportId, setCurrentReportId] = useState<string | undefined>(initialReportId);
  const [isEditMode, setIsEditMode] = useState<boolean>(!initialReportId);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isAutoSaveCreatedRef = React.useRef(false);
  const reportIdRef = React.useRef<string | undefined>(initialReportId);
  const creatingRef = React.useRef(false);
  const pendingSaveRef = React.useRef(false);
  const [status, setStatus] = useState<'PASS' | 'FAIL'>('PASS');

  const [formData, setFormData] = useState<ReportData>({
    customer: '',
    address: '',
    user: '',
    date: new Date().toISOString().split('T')[0],
    jobNumber: '',
    technicians: '',
    identifier: 'ATL06',
    substation: '',
    eqptLocation: '',
    temperature: 70,
    humidity: 0,
    nameplate: { manufacturer: '', catalogNo: '', serialNumber: '', dateOfMfg: '', type: '', systemVoltage: '', ratedVoltage: '', ratedCurrent: '', aicRating: '', impulseLevelBIL: '', sf6GasMass: '' },
    vfi: { manufacturer: '', catalogNo: '', type: '', ratedVoltage: '', ratedCurrent: '', aicRating: '' },
    visualInspection: Object.fromEntries(INSPECTION_ITEMS.map(i => [i.id, 'Select One'] as const)),
    counterReadings: [
      { identifier: 'Source 1', asFound: '', asLeft: '' },
      { identifier: 'Source 2', asFound: '', asLeft: '' },
      { identifier: 'Feeder 1', asFound: '', asLeft: '' },
    ],
    insulationMeasured: { testVoltage: '5000V', rows: [
      { waySection: 'Source 1', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Source 2', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Source 3', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Feeder 1', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Feeder 2', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Feeder 3', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
    ] },
    insulationCorrected: { testVoltage: '5000V', rows: [
      { waySection: 'Source 1', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Source 2', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Source 3', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Feeder 1', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Feeder 2', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
      { waySection: 'Feeder 3', ag: '', bg: '', cg: '', ab: '', bc: '', ca: '', lineA: '', lineB: '', lineC: '', units: '' },
    ] },
    contactResistance: { rows: [
      { waySection: 'S1-F1', aPhase: '', aG: '', bPhase: '', bG: '', cPhase: '', cG: '', units: '' },
      { waySection: 'S2-F1', aPhase: '', aG: '', bPhase: '', bG: '', cPhase: '', cG: '', units: '' },
      { waySection: 'Source 1', aPhase: '', aG: '', bPhase: '', bG: '', cPhase: '', cG: '', units: '' },
      { waySection: 'Source 2', aPhase: '', aG: '', bPhase: '', bG: '', cPhase: '', cG: '', units: '' },
      { waySection: 'Feeder 1', aPhase: '', aG: '', bPhase: '', bG: '', cPhase: '', cG: '', units: '' },
      { waySection: 'Feeder 2', aPhase: '', aG: '', bPhase: '', bG: '', cPhase: '', cG: '', units: '' },
    ] },
    dielectricWithstand: { testVoltage: '10 kVAC', rows: [
      { waySection: 'Source 1', ag: '', bg: '', cg: '', units: '' },
      { waySection: 'Source 2', ag: '', bg: '', cg: '', units: '' },
      { waySection: 'Feeder 1', ag: '', bg: '', cg: '', units: '' },
    ] },
    dielectricVFI: { testVoltage: '30 kVAC', rows: [
      { vfiIdentifier: 'Feeder 1', serialNumber: '', a: '', b: '', c: '', units: '' },
      { vfiIdentifier: 'Feeder 2', serialNumber: '', a: '', b: '', c: '', units: '' },
      { vfiIdentifier: 'Feeder 3', serialNumber: '', a: '', b: '', c: '', units: '' },
    ] },
    equipment: { megohmmeter: { model: '', serial: '', ampId: '', calDate: '' }, lowResOhmmeter: { model: '', serial: '', ampId: '', calDate: '' }, hipot: { model: '', serial: '', ampId: '', calDate: '' } },
    comments: ''
  });

  // Print styles: clean table UI only (copy approach from PanelboardReport)
  useEffect(() => {
    const styleId = 'atl06-sf6-print-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Hide navigation bar and scrollbar */
      @media print {
        nav, header, .navigation, [class*="nav"], [class*="header"] { display: none !important; }
        body { overflow-x: hidden; }

        /* Remove card and section chrome; show clean tables only */
        .bg-white, .dark\\:bg-dark-150, .rounded-lg, .shadow, section { background: white !important; box-shadow: none !important; border: none !important; padding: 0 !important; margin: 0 !important; }
        .border, [class*='border'], .print\\:border, .print\\:border-black { border: none !important; }

        /* Force black text */
        * { color: black !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

        /* Hide interactive elements and keep values only */
        button { display: none !important; }
        .print\\:hidden { display: none !important; }
        input, select, textarea { background: transparent !important; border: none !important; box-shadow: none !important; outline: none !important; padding: 0 !important; margin: 0 !important; font-size: 9px !important; -webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important; border-radius: 0 !important; background-image: none !important; }
        /* Stronger targeting inside the report to guarantee no boxes */
        #report-container input, #report-container select, #report-container textarea { background: transparent !important; border: none !important; box-shadow: none !important; outline: none !important; border-radius: 0 !important; background-image: none !important; }
        #report-container table input, #report-container table select, #report-container table textarea { background: transparent !important; border: none !important; box-shadow: none !important; outline: none !important; border-radius: 0 !important; background-image: none !important; }
        input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
        input[type="number"] { -moz-appearance: textfield !important; }

        /* Tables only: crisp borders */
        table { width: 100% !important; border-collapse: collapse !important; margin: 2px 0 !important; page-break-inside: avoid !important; }
        thead { display: table-header-group !important; }
        th, td { border: 1px solid black !important; padding: 2px 3px !important; font-size: 9px !important; text-align: center !important; }

        /* Remove colored backgrounds */
        .bg-gray-50, .dark\\:bg-dark-200, .bg-[#f26722] { background: white !important; }

        /* Page setup */
        html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif !important; font-size: 9px !important; background: white !important; line-height: 1.1 !important; }
        @page { size: 8.5in 11in; margin: 0.2in; }

        /* Allow content to flow across multiple pages */
        .max-w-7xl { page-break-inside: auto !important; break-inside: auto !important; }
        
        /* Allow sections to break across pages when needed */
        .mb-6 { page-break-inside: auto !important; break-inside: auto !important; }
        
        /* Allow tables to span pages but keep headers */
        table { page-break-inside: auto !important; break-inside: auto !important; }
        thead { display: table-header-group !important; }
        tr { page-break-inside: auto !important; break-inside: auto !important; }
        
        /* Ensure content doesn't get cut off */
        body { height: auto !important; min-height: auto !important; }

        /* Spacing compaction */
        .space-y-4 > * + *, .space-y-6 > * + * { margin-top: 2px !important; }
        .mb-4 { margin-bottom: 2px !important; }
        .mb-6 { margin-bottom: 3px !important; }
        .mb-8 { margin-bottom: 3px !important; }
        .p-6 { padding: 0 !important; }

        /* Hide on-screen forms for Nameplate and VFI Data in print, show only tables */
        .section-nameplate-data + .grid.print\\:hidden { display: none !important; }
        .section-vfi-data + .grid.print\\:hidden { display: none !important; }

        /* Show print header */
        .print\\:flex.hidden { display: flex !important; }

        /* PASS/FAIL status box styling for print */
        .pass-fail-status-box {
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
      .pass-fail-status-box.pass {
        background-color: #22c55e !important;
        border-color: #16a34a !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.fail {
        background-color: #ef4444 !important;
        border-color: #dc2626 !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pass-fail-status-box.limited {
        background-color: #eab308 !important;
        border-color: #ca8a04 !important;
        color: #111827 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

        /* Ensure large sections can flow across pages */
        .space-y-6 { page-break-inside: auto !important; }
        
        /* Comments section should be able to span pages */
        .comments-section { page-break-inside: auto !important; }
        
        /* Override any height restrictions */
        * { max-height: none !important; }
        
        /* Force all containers to allow page breaks */
        div, section, article { page-break-inside: auto !important; break-inside: auto !important; }
        
        /* Remove any orphan/widow controls that might cut content */
        * { orphans: 1 !important; widows: 1 !important; }
        
        /* Ensure the main container doesn't limit height */
        #report-container { height: auto !important; min-height: auto !important; max-height: none !important; }
        
        /* Ensure Test Equipment and Comments sections are visible */
        .section-test-equipment, .section-comments { display: block !important; visibility: visible !important; }
        
        /* Make sure these sections don't get hidden */
        h2.section-test-equipment, h2.section-comments { display: block !important; }
        
        /* Ensure textarea in comments shows properly */
        textarea { display: block !important; width: 100% !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  const handleChange = (key: keyof ReportData, value: string | number) => {
    setFormData(prev => ({ ...prev, [key]: value } as ReportData));
  };

  // Nested handlers
  const handleNameplateChange = (key: keyof NameplateData, value: string) => setFormData(prev => ({ ...prev, nameplate: { ...prev.nameplate, [key]: value } }));
  const handleVFIChange = (key: keyof VFIData, value: string) => setFormData(prev => ({ ...prev, vfi: { ...prev.vfi, [key]: value } }));
  const handleInspectionChange = (id: string, value: ResultOption) => setFormData(prev => ({ ...prev, visualInspection: { ...prev.visualInspection, [id]: value } }));
  const handleCounterChange = (idx: number, key: keyof CounterReadingRow, value: string) => setFormData(prev => ({ ...prev, counterReadings: prev.counterReadings.map((r, i) => i === idx ? { ...r, [key]: value } : r) }));
  const handleInsulationRowChange = (section: 'insulationMeasured' | 'insulationCorrected', idx: number, key: keyof InsulationRow, value: string) => setFormData(prev => ({ ...prev, [section]: { ...prev[section], rows: prev[section].rows.map((r, i) => i === idx ? { ...r, [key]: value } : r) } } as any));
  const handleInsulationVoltageChange = (section: 'insulationMeasured' | 'insulationCorrected', value: string) => setFormData(prev => ({ ...prev, [section]: { ...prev[section], testVoltage: value } } as any));
  const handleContactRowChange = (idx: number, key: keyof ContactRow, value: string) => setFormData(prev => ({ ...prev, contactResistance: { rows: prev.contactResistance.rows.map((r, i) => i === idx ? { ...r, [key]: value } : r) } }));
  const handleDielectricRowChange = (idx: number, key: keyof DielectricRow, value: string) => setFormData(prev => ({ ...prev, dielectricWithstand: { ...prev.dielectricWithstand, rows: prev.dielectricWithstand.rows.map((r, i) => i === idx ? { ...r, [key]: value } : r) } }));
  const handleDielectricVoltageChange = (value: string) => setFormData(prev => ({ ...prev, dielectricWithstand: { ...prev.dielectricWithstand, testVoltage: value } }));
  const handleDielectricVFIChange = (idx: number, key: keyof DielectricVFIRow, value: string) =>
    setFormData(prev => ({
      ...prev,
      dielectricVFI: {
        ...prev.dielectricVFI,
        rows: prev.dielectricVFI.rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
      },
    }));
  const handleEquipmentChange = (group: keyof EquipmentInfo, key: 'model' | 'serial' | 'ampId', value: string) => setFormData(prev => ({ ...prev, equipment: { ...prev.equipment, [group]: { ...(prev.equipment as any)[group], [key]: value } } }));

  // Auto-save function
  const autoSave = React.useCallback(async () => {
    if (!jobId || !user?.id) return;

    const payload = {
      job_id: jobId,
      user_id: user.id,
      status,
      report_info: {
        customer: formData.customer,
        address: formData.address,
        user: formData.user,
        date: formData.date,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        identifier: formData.identifier,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        humidity: formData.humidity,
      },
      nameplate_data: formData.nameplate,
      vfi_data: formData.vfi,
      visual_mechanical: formData.visualInspection,
      counter_readings: formData.counterReadings,
      insulation_resistance_measured: formData.insulationMeasured,
      insulation_resistance_corrected: formData.insulationCorrected,
      contact_resistance: formData.contactResistance,
      dielectric_withstand: formData.dielectricWithstand,
      dielectric_vfi: formData.dielectricVFI,
      test_equipment: formData.equipment,
      comments: formData.comments,
    };

    try {
      setIsAutoSaving(true);

      if (reportIdRef.current) {
        const { error } = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_sf6_reports')
          .update(payload)
          .eq('id', reportIdRef.current);

        if (error) {
          console.error('Auto-save update error:', error);
          throw error;
        }
      } else if (creatingRef.current) {
        pendingSaveRef.current = true;
      } else {
        creatingRef.current = true;
        try {
          const { data, error } = await supabase
            .schema('neta_ops')
            .from('medium_voltage_switch_sf6_reports')
            .insert(payload)
            .select('id')
            .single();

          if (error) {
            console.error('Auto-save insert error:', error);
            throw error;
          }

          if (data) {
            const newReportId = data.id;
            reportIdRef.current = newReportId;

            const assetData = {
              name: `Medium Voltage Switch SF6 - ${formData.identifier || formData.eqptLocation || ''}`,
              file_url: `report:/jobs/${jobId}/medium-voltage-switch-sf6/${newReportId}`,
              user_id: user.id
            };

            const { data: assetResult, error: assetError } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert(assetData)
              .select('id')
              .single();

            if (assetError) {
              console.error('Auto-save asset error:', assetError);
            }

            if (assetResult) {
              const { error: linkError } = await supabase
                .schema('neta_ops')
                .from('job_assets')
                .insert({ job_id: jobId, asset_id: assetResult.id, user_id: user.id });

              if (linkError) {
                console.error('Auto-save job_assets link error:', linkError);
              }
            }

            setCurrentReportId(newReportId);
            isAutoSaveCreatedRef.current = true;
            window.history.replaceState({}, '', `/jobs/${jobId}/medium-voltage-switch-sf6/${newReportId}`);
          } else {
            creatingRef.current = false;
          }
        } catch (insertError) {
          creatingRef.current = false;
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    } finally {
      setIsAutoSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setTimeout(() => autoSave(), 0);
      }
    }
  }, [jobId, user?.id, formData, status]);

  // Auto-save effect with debounce
  useEffect(() => {
    if (!isEditMode || isSaving || loading) return;
    
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, status, isEditMode, isSaving, loading, autoSave]);

  const handleSave = async () => {
    if (!jobId || !user?.id) return;
    setIsSaving(true);
    try {
      const reportInfo = {
        customer: formData.customer,
        address: formData.address,
        user: formData.user,
        date: formData.date,
        jobNumber: formData.jobNumber,
        technicians: formData.technicians,
        identifier: formData.identifier,
        substation: formData.substation,
        eqptLocation: formData.eqptLocation,
        temperature: formData.temperature,
        humidity: formData.humidity,
      };

      const payload = {
        job_id: jobId,
        user_id: user.id,
        status,
        report_info: reportInfo,
        nameplate_data: formData.nameplate,
        vfi_data: formData.vfi,
        visual_mechanical: formData.visualInspection,
        counter_readings: formData.counterReadings,
        insulation_resistance_measured: formData.insulationMeasured,
        insulation_resistance_corrected: formData.insulationCorrected,
        contact_resistance: formData.contactResistance,
        dielectric_withstand: formData.dielectricWithstand,
        dielectric_vfi: formData.dielectricVFI,
        test_equipment: formData.equipment,
        comments: formData.comments,
      } as any;

      let savedId = currentReportId;
      if (currentReportId) {
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_sf6_reports')
          .update(payload)
          .eq('id', currentReportId)
          .select('id')
          .single();
        if (error) throw error;
        savedId = data?.id || currentReportId;
      } else {
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_sf6_reports')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        savedId = data?.id;

        // Create asset and link to job
        if (savedId) {
          const assetName = `Medium Voltage Switch SF6 Report - ${formData.identifier || formData.substation || 'Unnamed'}`;
          const fileUrl = `report:/jobs/${jobId}/medium-voltage-switch-sf6-report/${savedId}`;
          const { data: asset, error: assetError } = await supabase
            .schema('neta_ops')
            .from('assets')
            .insert({ name: assetName, file_url: fileUrl, user_id: user.id })
            .select('id')
            .single();
          if (assetError) throw assetError;

          if (asset?.id) {
            const { error: linkError } = await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({ job_id: jobId, asset_id: asset.id, user_id: user.id });
            if (linkError) throw linkError;
          }
        }
      }

      setIsEditMode(false);
      // Report saved silently
      navigate(`/jobs/${jobId}`);
    } catch (e: any) {
      console.error('Error saving Medium Voltage Switch SF6 report:', e);
      alert(`Failed to save report: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-load Job Info (customer, address, job number)
  useEffect(() => {
    const loadJobInfo = async () => {
      if (!jobId || currentReportId) {
        setLoading(false);
        return; // skip when loading an existing report
      }
      try {
        const { data: jobData, error: jobError } = await supabase
          .schema('neta_ops')
          .from('jobs')
          .select('job_number, customer_id, site_address')
          .eq('id', jobId)
          .single();
        if (jobError) throw jobError;

        let customerName = '';
        let customerAddress = (jobData as any).site_address || '';
        if (jobData?.customer_id) {
          const { data: customerData } = await supabase
            .schema('common')
            .from('customers')
            .select('name, company_name, address')
            .eq('id', jobData.customer_id)
            .single();
          if (customerData) {
            customerName = customerData.company_name || customerData.name || '';
            if (!customerAddress) customerAddress = customerData.address || '';
          }
        }

        setFormData(prev => ({
          ...prev,
          jobNumber: jobData?.job_number || prev.jobNumber,
          customer: maskCustomerName(customerName || prev.customer),
          address: maskCustomerAddress(customerAddress || prev.address),
        }));
      } catch (e) {
        console.error('Failed to load job info', e);
      } finally {
        setLoading(false);
      }
    };
    loadJobInfo();
  }, [jobId, currentReportId]);

  // Load existing report by id
  useEffect(() => {
    const loadExistingReport = async () => {
      // Don't reload if we just created the report via autosave
      if (isAutoSaveCreatedRef.current) {
        isAutoSaveCreatedRef.current = false;
        setLoading(false);
        return;
      }

      if (!currentReportId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const { data, error } = await supabase
          .schema('neta_ops')
          .from('medium_voltage_switch_sf6_reports')
          .select('*')
          .eq('id', currentReportId)
          .single();
        if (error) throw error;
        if (data) {
          setStatus((data.status as 'PASS' | 'FAIL') || 'PASS');
          const ri = (data.report_info || {}) as any;
          setFormData(prev => ({
            ...prev,
            customer: ri.customer ?? prev.customer,
            address: ri.address ?? prev.address,
            user: ri.user ?? prev.user,
            date: ri.date ?? prev.date,
            jobNumber: ri.jobNumber ?? prev.jobNumber,
            technicians: ri.technicians ?? prev.technicians,
            identifier: ri.identifier ?? prev.identifier,
            substation: ri.substation ?? prev.substation,
            eqptLocation: ri.eqptLocation ?? prev.eqptLocation,
            temperature: typeof ri.temperature === 'number' ? ri.temperature : prev.temperature,
            humidity: typeof ri.humidity === 'number' ? ri.humidity : prev.humidity,
            nameplate: data.nameplate_data || prev.nameplate,
            vfi: data.vfi_data || prev.vfi,
            visualInspection: data.visual_mechanical || prev.visualInspection,
            counterReadings: data.counter_readings || prev.counterReadings,
            insulationMeasured: data.insulation_resistance_measured || prev.insulationMeasured,
            insulationCorrected: data.insulation_resistance_corrected || prev.insulationCorrected,
            contactResistance: data.contact_resistance || prev.contactResistance,
            dielectricWithstand: data.dielectric_withstand || prev.dielectricWithstand,
            dielectricVFI: data.dielectric_vfi || prev.dielectricVFI,
            equipment: data.test_equipment || prev.equipment,
            comments: data.comments ?? prev.comments,
          }));
          setIsEditMode(false);
        }
      } catch (e) {
        console.error('Failed to load existing SF6 report', e);
      } finally {
        setLoading(false);
      }
    };
    loadExistingReport();
  }, [currentReportId]);

  // Temperature conversion and TCF utilities (mirroring other reports)
  const convertFahrenheitToCelsius = (fahrenheit: number): number => {
    // Linear conversion with 1 decimal precision
    const c = (fahrenheit - 32) * 5 / 9;
    return parseFloat(c.toFixed(1));
  };

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
    { celsius: 101, multiplier: 42.08 },
    { celsius: 102, multiplier: 44.16 },
    { celsius: 103, multiplier: 46.24 },
    { celsius: 104, multiplier: 48.32 },
    { celsius: 105, multiplier: 50.4 },
    { celsius: 106, multiplier: 52.96 },
    { celsius: 107, multiplier: 55.52 },
    { celsius: 108, multiplier: 58.08 },
    { celsius: 109, multiplier: 60.64 },
    { celsius: 110, multiplier: 63.2 },
  ];

  const getTCF = (celsius: number): number => {
    if (TCF_DATA.length === 0) return 1.0;
    if (celsius <= TCF_DATA[0].celsius) return TCF_DATA[0].multiplier;
    if (celsius >= TCF_DATA[TCF_DATA.length - 1].celsius) return TCF_DATA[TCF_DATA.length - 1].multiplier;
    const exact = TCF_DATA.find(d => d.celsius === Number(celsius.toFixed(0)));
    if (exact) return exact.multiplier;
    for (let i = 0; i < TCF_DATA.length - 1; i++) {
      const lower = TCF_DATA[i];
      const upper = TCF_DATA[i + 1];
      if (celsius > lower.celsius && celsius < upper.celsius) {
        const proportion = (celsius - lower.celsius) / (upper.celsius - lower.celsius);
        return lower.multiplier + proportion * (upper.multiplier - lower.multiplier);
      }
    }
    return 1.0;
  };

  const celsiusTemperature = convertFahrenheitToCelsius(formData.temperature);
  const tcf = getTCF(celsiusTemperature);

  // Auto-calculate temperature-corrected insulation values = measured * TCF
  useEffect(() => {
    const applyReading = (v: string): string => {
      const trimmed = (v ?? '').toString().trim();
      if (trimmed === '') return '';
      const num = parseFloat(trimmed);
      if (Number.isNaN(num)) return trimmed;
      return (num * tcf).toFixed(2);
    };

    setFormData(prev => {
      const newRows = prev.insulationMeasured.rows.map(r => ({
        waySection: r.waySection,
        ag: applyReading(r.ag),
        bg: applyReading(r.bg),
        cg: applyReading(r.cg),
        ab: applyReading(r.ab),
        bc: applyReading(r.bc),
        ca: applyReading(r.ca),
        lineA: applyReading(r.lineA),
        lineB: applyReading(r.lineB),
        lineC: applyReading(r.lineC),
        units: r.units,
      }));

      // Avoid unnecessary state updates
      const same = JSON.stringify(prev.insulationCorrected.rows) === JSON.stringify(newRows);
      if (same) return prev;

      return {
        ...prev,
        insulationCorrected: { ...prev.insulationCorrected, rows: newRows },
      };
    });
  }, [formData.temperature, formData.insulationMeasured]);

  return (
    <div id="report-container" className="w-full overflow-visible">
      <div className="p-6 max-w-7xl mx-auto space-y-6 dark:text-white">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/jobs/${jobId}`)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-white dark:hover:text-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Job
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Medium Voltage Way Switch (SF6)</h1>
          </div>
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(e) => { if (isEditMode) setStatus(e.target.value as 'PASS' | 'FAIL'); }}
              disabled={!isEditMode}
              className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                status === 'PASS' ? 'bg-green-600 text-white focus:ring-green-500' : 'bg-red-600 text-white focus:ring-red-500'
              } ${!isEditMode ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 dark:bg-opacity-80'}`}
            >
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              ✓ Auto Saving Enabled
            </span>
            {currentReportId && !isEditMode ? (
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
                className={`px-4 py-2 text-sm text-white bg-orange-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${!isEditMode ? 'hidden' : 'hover:bg-orange-700'}`}
              >
                {isSaving ? 'Saving...' : currentReportId ? 'Update Report' : 'Save Report'}
              </button>
            )}
          </div>
        </div>
        {/* Print header */}
        <div className="print:flex hidden items-center justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div style={{ width: '120px', display: 'flex', justifyContent: 'flex-start' }}>
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" className="h-10 w-auto" style={{ maxHeight: 35, marginLeft: '5px', marginTop: '2px' }} />
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold text-black mb-1">Medium Voltage Way Switch (SF6)</h1>
          </div>
          <div className="text-right font-extrabold text-xl" style={{ color: '#1a4e7c', width: '120px' }}>
            ATS 7.5.4
            <div className="hidden print:block mt-2">
              <div 
                className={`pass-fail-status-box ${getPassFailBadgeClass(status)}`}
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  width: 'fit-content',
                  borderRadius: '6px',
                  border: status === 'PASS' ? '2px solid #16a34a' : '2px solid #dc2626',
                  backgroundColor: status === 'PASS' ? '#22c55e' : '#ef4444',
                  color: 'white',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                  boxSizing: 'border-box',
                  minWidth: '50px',
                }}
              >
                {status}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Job Information */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Job Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 print:hidden">
            <div>
              <label className="form-label">Customer:</label>
              <input className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.customer} readOnly={!isEditMode} onChange={(e) => handleChange('customer', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Address:</label>
              <input className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={maskCustomerAddress(formData.address)} readOnly={!isEditMode} onChange={(e) => handleChange('address', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Job #:</label>
              <input className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.jobNumber} readOnly={!isEditMode} onChange={(e) => handleChange('jobNumber', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Date:</label>
              <input type="date" className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.date} readOnly={!isEditMode} onChange={(e) => handleChange('date', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Technicians:</label>
              <input className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.technicians} readOnly={!isEditMode} onChange={(e) => handleChange('technicians', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Identifier:</label>
              <input className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.identifier} readOnly={!isEditMode} onChange={(e) => handleChange('identifier', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Substation:</label>
              <input className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.substation} readOnly={!isEditMode} onChange={(e) => handleChange('substation', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Eqpt. Location:</label>
              <input className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.eqptLocation} readOnly={!isEditMode} onChange={(e) => handleChange('eqptLocation', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-x-2">
              <div>
                <label className="form-label">Temp (°F):</label>
                <input type="number" className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.temperature} readOnly={!isEditMode} onChange={(e) => handleChange('temperature', Number(e.target.value))} />
              </div>
              <div>
                <label className="form-label">Humidity (%):</label>
                <input type="number" className={`form-input text-sm ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.humidity || ''} readOnly={!isEditMode} onChange={(e) => handleChange('humidity', e.target.value === '' ? 0 : Number(e.target.value))} />
              </div>
            </div>
            <div className="flex items-end">
              <div className="flex items-center mt-auto">
                <label className="form-label mr-2">Temp (°C):</label>
                <input type="number" value={Number.isFinite(celsiusTemperature) ? Number(celsiusTemperature.toFixed(0)) : 0} readOnly className="form-input text-sm w-24 bg-gray-100 dark:bg-dark-150" />
                <span className="mx-3 form-label">TCF:</span>
                <span className="font-medium text-gray-900 dark:text-white">{Number.isFinite(tcf) ? tcf : ''}</span>
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
                temperature: { fahrenheit: formData.temperature, celsius: undefined, tcf: undefined, humidity: formData.humidity },
              }}
            />
          </div>
        </div>
        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Nameplate Data */}
        <div className="mb-6">
          <h2 className="section-nameplate-data text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Nameplate Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
            <div className="space-y-3">
              <div><label className="form-label inline-block w-40">Manufacturer</label><input className={`form-input`} value={formData.nameplate.manufacturer} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('manufacturer', e.target.value)} /></div>
              <div><label className="form-label inline-block w-40">Catalog No.</label><input className={`form-input`} value={formData.nameplate.catalogNo} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('catalogNo', e.target.value)} /></div>
              <div><label className="form-label inline-block w-40">Serial Number</label><input className={`form-input`} value={formData.nameplate.serialNumber} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('serialNumber', e.target.value)} /></div>
              <div><label className="form-label inline-block w-40">Date of Mfg.</label><input className={`form-input`} value={formData.nameplate.dateOfMfg} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('dateOfMfg', e.target.value)} /></div>
              <div><label className="form-label inline-block w-40">Type</label><input className={`form-input`} value={formData.nameplate.type} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('type', e.target.value)} /></div>
              <div><label className="form-label inline-block w-40">SF6 Gas Mass</label><input className={`form-input`} value={formData.nameplate.sf6GasMass} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('sf6GasMass', e.target.value)} /></div>
            </div>
            <div className="space-y-3">
              <div><label className="form-label inline-block w-48">System Voltage (kV)</label><input className={`form-input`} value={formData.nameplate.systemVoltage} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('systemVoltage', e.target.value)} /></div>
              <div><label className="form-label inline-block w-48">Rated Voltage (kV)</label><input className={`form-input`} value={formData.nameplate.ratedVoltage} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('ratedVoltage', e.target.value)} /></div>
              <div><label className="form-label inline-block w-48">Rated Current (A)</label><input className={`form-input`} value={formData.nameplate.ratedCurrent} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('ratedCurrent', e.target.value)} /></div>
              <div><label className="form-label inline-block w-48">SCCR (kA)</label><input className={`form-input`} value={formData.nameplate.aicRating} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('aicRating', e.target.value)} /></div>
              <div><label className="form-label inline-block w-48">Impulse Level (BIL)</label><input className={`form-input`} value={formData.nameplate.impulseLevelBIL} readOnly={!isEditMode} onChange={(e) => handleNameplateChange('impulseLevelBIL', e.target.value)} /></div>
            </div>
          </div>
          <div className="hidden print:block">
            {(() => {
              const cells: { label: string; value: string }[] = [
                { label: 'Manufacturer', value: formData.nameplate.manufacturer },
                { label: 'Catalog No.', value: formData.nameplate.catalogNo },
                { label: 'Serial Number', value: formData.nameplate.serialNumber },
                { label: 'Date of Mfg.', value: formData.nameplate.dateOfMfg },
                { label: 'Type', value: formData.nameplate.type },
                { label: 'SF6 Gas Mass', value: formData.nameplate.sf6GasMass },
                { label: 'System Voltage (kV)', value: formData.nameplate.systemVoltage },
                { label: 'Rated Voltage (kV)', value: formData.nameplate.ratedVoltage },
                { label: 'Rated Current (A)', value: formData.nameplate.ratedCurrent },
                { label: 'SCCR (kA)', value: formData.nameplate.aicRating },
                { label: 'Impulse Level (BIL)', value: formData.nameplate.impulseLevelBIL },
                { label: '', value: '' }, // one blank cell to make 2 rows x 6 cols
              ];
              return (
                <table className="w-full border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '16.66%' }} />
                    <col style={{ width: '16.66%' }} />
                    <col style={{ width: '16.66%' }} />
                    <col style={{ width: '16.66%' }} />
                    <col style={{ width: '16.66%' }} />
                    <col style={{ width: '16.66%' }} />
                  </colgroup>
                  <tbody>
                    {[0, 1].map(row => (
                      <tr key={row}>
                        {cells.slice(row * 6, row * 6 + 6).map((c, idx) => (
                          <td key={idx} className="px-2 py-1 align-top border border-gray-300 dark:border-gray-600">
                            <div className="font-semibold">{c.label}</div>
                            <div>{c.value}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* VFI Data */}
        <div className="mb-6">
          <h2 className="section-vfi-data text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">VFI Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
            <div className="space-y-3">
              <div><label className="form-label inline-block w-40">Manufacturer</label><input className={`form-input`} value={formData.vfi.manufacturer} readOnly={!isEditMode} onChange={(e) => handleVFIChange('manufacturer', e.target.value)} /></div>
              <div><label className="form-label inline-block w-40">Catalog No.</label><input className={`form-input`} value={formData.vfi.catalogNo} readOnly={!isEditMode} onChange={(e) => handleVFIChange('catalogNo', e.target.value)} /></div>
              <div><label className="form-label inline-block w-40">Type</label><input className={`form-input`} value={formData.vfi.type} readOnly={!isEditMode} onChange={(e) => handleVFIChange('type', e.target.value)} /></div>
            </div>
            <div className="space-y-3">
              <div><label className="form-label inline-block w-48">Rated Voltage (kV)</label><input className={`form-input`} value={formData.vfi.ratedVoltage} readOnly={!isEditMode} onChange={(e) => handleVFIChange('ratedVoltage', e.target.value)} /></div>
              <div><label className="form-label inline-block w-48">Rated Current (A)</label><input className={`form-input`} value={formData.vfi.ratedCurrent} readOnly={!isEditMode} onChange={(e) => handleVFIChange('ratedCurrent', e.target.value)} /></div>
              <div><label className="form-label inline-block w-48">SCCR (kA)</label><input className={`form-input`} value={formData.vfi.aicRating} readOnly={!isEditMode} onChange={(e) => handleVFIChange('aicRating', e.target.value)} /></div>
            </div>
          </div>
          <div className="hidden print:block">
            {(() => {
              const cells: { label: string; value: string }[] = [
                { label: 'Manufacturer', value: formData.vfi.manufacturer },
                { label: 'Catalog No.', value: formData.vfi.catalogNo },
                { label: 'Type', value: formData.vfi.type },
                { label: 'Rated Voltage (kV)', value: formData.vfi.ratedVoltage },
                { label: 'Rated Current (A)', value: formData.vfi.ratedCurrent },
                { label: 'SCCR (kA)', value: formData.vfi.aicRating },
              ];
              return (
                <table className="w-full border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '33.33%' }} />
                    <col style={{ width: '33.33%' }} />
                    <col style={{ width: '33.33%' }} />
                  </colgroup>
                  <tbody>
                    {[0, 1].map(row => (
                      <tr key={row}>
                        {cells.slice(row * 3, row * 3 + 3).map((c, idx) => (
                          <td key={idx} className="px-2 py-1 align-top border border-gray-300 dark:border-gray-600">
                            <div className="font-semibold">{c.label}</div>
                            <div>{c.value}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Visual and Mechanical Inspection + Counter Readings */}
        <div className="mb-6">
          <h2 className="section-visual-mechanical text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Visual and Mechanical Inspection</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '58%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">NETA Section</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Description</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Result</th>
                  <th className="px-3 py-2 bg-gray-50 dark:bg-dark-150 text-left text-xs font-medium text-gray-500 dark:text-white uppercase tracking-wider">Comments</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-150 divide-y divide-gray-200 dark:divide-gray-700">
                {INSPECTION_ITEMS.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.id}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 dark:text-white whitespace-normal break-words">{item.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select value={formData.visualInspection[item.id]} onChange={(e) => handleInspectionChange(item.id, e.target.value as ResultOption)} disabled={!isEditMode} className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`}>
                        {RESULT_OPTIONS.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input type="text" className={`block w-full rounded-md border-gray-300 dark:border-gray-700 shadow-sm focus:border-[#f26722] focus:ring-[#f26722] dark:bg-dark-150 dark:text-white ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} readOnly={!isEditMode} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  <th colSpan={3} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Counter Readings</th>
                </tr>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  {['Identifier','As Found','As Left'].map(h => (
                    <th key={h} className="px-2 py-1 text-left border border-gray-300 dark:border-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formData.counterReadings.map((row, i) => (
                  <tr key={`${row.identifier}-${i}`} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input className={`form-input text-xs ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.identifier} readOnly={!isEditMode} onChange={(e) => handleCounterChange(i, 'identifier', e.target.value)} />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input className={`form-input text-xs ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.asFound} readOnly={!isEditMode} onChange={(e) => handleCounterChange(i, 'asFound', e.target.value)} />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <input className={`form-input text-xs ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.asLeft} readOnly={!isEditMode} onChange={(e) => handleCounterChange(i, 'asLeft', e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Electrical Tests - Measured IR */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Electrical Tests - Measured Insulation Resistance Values</h2>
          <div className="flex justify-end mb-2">
            <div className="w-40">
              <label className="text-sm font-medium text-gray-700 dark:text-white">Test Voltage:</label>
              <select className="form-select text-sm" value={formData.insulationMeasured.testVoltage} onChange={(e) => handleInsulationVoltageChange('insulationMeasured', e.target.value)} disabled={!isEditMode}>
                {TEST_VOLTAGE_IR.map(v => (<option key={v} value={v}>{v}</option>))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col style={{ width: '7%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '5%' }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  <th rowSpan={2} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Way Section</th>
                  <th colSpan={6} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Way Closed</th>
                  <th colSpan={3} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Line to Load (Way Open)</th>
                  <th rowSpan={2} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Units</th>
                </tr>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  {['A-G','B-G','C-G','A-B','B-C','C-A','A','B','C'].map(h => (
                    <th key={h} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formData.insulationMeasured.rows.map((row, i) => (
                  <tr key={row.waySection} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center">
                      <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.waySection} readOnly={!isEditMode} onChange={(e) => handleInsulationRowChange('insulationMeasured', i, 'waySection', e.target.value)} />
                    </td>
                    {(['ag','bg','cg','ab','bc','ca','lineA','lineB','lineC'] as (keyof InsulationRow)[]).map((key) => (
                      <td key={String(key)} className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={(row as any)[key] as string} readOnly={!isEditMode} onChange={(e) => handleInsulationRowChange('insulationMeasured', i, key, e.target.value)} />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <select className="form-select text-xs text-center w-full" value={row.units} onChange={(e) => handleInsulationRowChange('insulationMeasured', i, 'units', e.target.value)} disabled={!isEditMode}>
                        <option value=""></option>
                        {IR_UNITS.map(u => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Electrical Tests - Temperature Corrected IR */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Electrical Tests - Temperature Corrected Insulation Resistance Values</h2>
          <div className="flex justify-end mb-2">
            <div className="w-40">
              <label className="text-sm font-medium text-gray-700 dark:text-white">Test Voltage:</label>
              <select className="form-select text-sm" value={formData.insulationCorrected.testVoltage} onChange={(e) => handleInsulationVoltageChange('insulationCorrected', e.target.value)} disabled={!isEditMode}>
                {TEST_VOLTAGE_IR.map(v => (<option key={v} value={v}>{v}</option>))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col style={{ width: '7%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '9.78%' }} />
                <col style={{ width: '5%' }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  <th rowSpan={2} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Way Section</th>
                  <th colSpan={6} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Way Closed</th>
                  <th colSpan={3} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Line to Load (Way Open)</th>
                  <th rowSpan={2} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Units</th>
                </tr>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  {['A-G','B-G','C-G','A-B','B-C','C-A','A','B','C'].map(h => (
                    <th key={h} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formData.insulationCorrected.rows.map((row, i) => (
                  <tr key={row.waySection} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center">
                      <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.waySection} readOnly={!isEditMode} onChange={(e) => handleInsulationRowChange('insulationCorrected', i, 'waySection', e.target.value)} />
                    </td>
                    {(['ag','bg','cg','ab','bc','ca','lineA','lineB','lineC'] as (keyof InsulationRow)[]).map((key) => (
                      <td key={String(key)} className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={(row as any)[key] as string} readOnly={!isEditMode} onChange={(e) => handleInsulationRowChange('insulationCorrected', i, key, e.target.value)} />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <select className="form-select text-xs text-center w-full" value={row.units} onChange={(e) => handleInsulationRowChange('insulationCorrected', i, 'units', e.target.value)} disabled={!isEditMode}>
                        <option value=""></option>
                        {IR_UNITS.map(u => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Electrical Tests - Contact Resistance */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Electrical Tests - Contact Resistance</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  <th className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">Way Section</th>
                  {['A-Phase','A-G','B-Phase','B-G','C-Phase','C-G','Units'].map(h => (
                    <th key={h} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formData.contactResistance.rows.map((row, i) => (
                  <tr key={row.waySection} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center">
                      <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.waySection} readOnly={!isEditMode} onChange={(e) => handleContactRowChange(i, 'waySection', e.target.value)} />
                    </td>
                    {(['aPhase','aG','bPhase','bG','cPhase','cG'] as (keyof ContactRow)[]).map(key => (
                      <td key={String(key)} className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={(row as any)[key] as string} readOnly={!isEditMode} onChange={(e) => handleContactRowChange(i, key, e.target.value)} />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <select className="form-select text-xs text-center w-full" value={row.units} onChange={(e) => handleContactRowChange(i, 'units', e.target.value)} disabled={!isEditMode}>
                        <option value=""></option>
                        {CONTACT_UNITS.map(u => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Electrical Tests - Dielectric Withstand */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Electrical Tests - Dielectric Withstand</h2>
          <div className="flex justify-end mb-2">
            <div className="w-40">
              <label className="text-sm font-medium text-gray-700 dark:text-white">Test Voltage:</label>
              <select className="form-select text-sm" value={formData.dielectricWithstand.testVoltage} onChange={(e) => handleDielectricVoltageChange(e.target.value)} disabled={!isEditMode}>
                {TEST_VOLTAGE_DW.map(v => (<option key={v} value={v}>{v}</option>))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  {['Way Section','A-G','B-G','C-G','Units'].map(h => (<th key={h} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {formData.dielectricWithstand.rows.map((row, i) => (
                  <tr key={row.waySection} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center">
                      <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.waySection} readOnly={!isEditMode} onChange={(e) => handleDielectricRowChange(i, 'waySection', e.target.value)} />
                    </td>
                    {(['ag','bg','cg'] as (keyof DielectricRow)[]).map(key => (
                      <td key={String(key)} className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={(row as any)[key] as string} readOnly={!isEditMode} onChange={(e) => handleDielectricRowChange(i, key, e.target.value)} />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <select className="form-select text-xs text-center w-full" value={row.units} onChange={(e) => handleDielectricRowChange(i, 'units', e.target.value)} disabled={!isEditMode}>
                        <option value=""></option>
                        {DIELECTRIC_UNITS.map(u => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Vacuum Integrity (VFI Open)</h3>
          <div className="flex justify-end mb-2">
            <div className="w-40">
              <label className="text-sm font-medium text-gray-700 dark:text-white">Test Voltage:</label>
              <input className="form-input text-sm" value={formData.dielectricVFI.testVoltage} readOnly />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-150">
                  {['VFI','Serial Number','A','B','C','Units'].map(h => (<th key={h} className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {formData.dielectricVFI.rows.map((row, i) => (
                  <tr key={`${row.vfiIdentifier}-${i}`} className="hover:bg-gray-50 dark:hover:bg-dark-200">
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center">
                      <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.vfiIdentifier} readOnly={!isEditMode} onChange={(e) => handleDielectricVFIChange(i, 'vfiIdentifier', e.target.value)} />
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1"><input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={row.serialNumber} readOnly={!isEditMode} onChange={(e) => handleDielectricVFIChange(i, 'serialNumber', e.target.value)} /></td>
                    {(['a','b','c'] as (keyof DielectricVFIRow)[]).map(key => (
                      <td key={String(key)} className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                        <input className={`form-input text-xs text-center ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={(row as any)[key] as string} readOnly={!isEditMode} onChange={(e) => handleDielectricVFIChange(i, key, e.target.value)} />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                      <select className="form-select text-xs text-center w-full" value={row.units} onChange={(e) => handleDielectricVFIChange(i, 'units', e.target.value)} disabled={!isEditMode}>
                        <option value=""></option>
                        {DIELECTRIC_UNITS.map(u => (<option key={u} value={u}>{u}</option>))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="w-full h-1 bg-[#f26722] mb-4 print:hidden" />

        {/* Test Equipment Used */}
        <div className="mb-6">
          <h2 className="section-test-equipment text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Test Equipment Used</h2>
          
          {/* Test Equipment table - visible on screen and print */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 dark:border-gray-700 print:border-black">
              <thead>
                <tr>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Equipment</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Model</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Serial Number</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">AMP ID</th>
                  <th className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 bg-gray-50 dark:bg-dark-150 print:bg-gray-50 font-bold text-center text-gray-900 dark:text-white">Cal Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 font-semibold text-gray-900 dark:text-white">Megohmmeter</td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <EquipmentAutocomplete
                      value={formData.equipment.megohmmeter.model}
                      onChange={(value) => handleEquipmentChange('megohmmeter', 'model', value)}
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
                        handleEquipmentChange('megohmmeter', 'model', equipment.equipment_name);
                        handleEquipmentChange('megohmmeter', 'serial', equipment.serial_number || '');
                        handleEquipmentChange('megohmmeter', 'ampId', equipment.amp_id || '');
                        handleEquipmentChange('megohmmeter', 'calDate', formatLocalDateShort(equipment.calibration_date));
                      }}
                      readOnly={!isEditMode}
                      className="w-full border-0 bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.megohmmeter.serial} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('megohmmeter', 'serial', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.megohmmeter.ampId} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('megohmmeter', 'ampId', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.megohmmeter.calDate} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('megohmmeter', 'calDate', e.target.value)} 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 font-semibold text-gray-900 dark:text-white">Low Resistance Ohmmeter</td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <EquipmentAutocomplete
                      value={formData.equipment.lowResOhmmeter.model}
                      onChange={(value) => handleEquipmentChange('lowResOhmmeter', 'model', value)}
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
                        handleEquipmentChange('lowResOhmmeter', 'model', equipment.equipment_name);
                        handleEquipmentChange('lowResOhmmeter', 'serial', equipment.serial_number || '');
                        handleEquipmentChange('lowResOhmmeter', 'ampId', equipment.amp_id || '');
                        handleEquipmentChange('lowResOhmmeter', 'calDate', formatLocalDateShort(equipment.calibration_date));
                      }}
                      readOnly={!isEditMode}
                      className="w-full border-0 bg-transparent"
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.lowResOhmmeter.serial} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('lowResOhmmeter', 'serial', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.lowResOhmmeter.ampId} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('lowResOhmmeter', 'ampId', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.lowResOhmmeter.calDate} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('lowResOhmmeter', 'calDate', e.target.value)} 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1 font-semibold text-gray-900 dark:text-white">Hipot</td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.hipot.model} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('hipot', 'model', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.hipot.serial} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('hipot', 'serial', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.hipot.ampId} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('hipot', 'ampId', e.target.value)} 
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-700 print:border-black px-2 py-1">
                    <input 
                      className={`w-full border-0 bg-transparent focus:outline-none focus:ring-0 text-gray-900 dark:text-white ${!isEditMode ? 'cursor-not-allowed' : ''}`}
                      value={formData.equipment.hipot.calDate} 
                      readOnly={!isEditMode} 
                      onChange={(e) => handleEquipmentChange('hipot', 'calDate', e.target.value)} 
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Comments */}
        <div className={`mb-6 print:mb-2 print:break-inside-avoid ${!formData.comments?.trim() ? 'print:hidden' : ''}`}>
          <h2 className="section-comments text-xl font-semibold mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Comments</h2>
          <textarea rows={10} className={`w-full form-textarea resize-vertical min-h-[250px] print:hidden ${!isEditMode ? 'bg-gray-100 dark:bg-dark-150' : ''}`} value={formData.comments} onChange={(e) => handleChange('comments', e.target.value)} readOnly={!isEditMode} />
          
          {formData.comments?.trim() && (
          <div className="hidden print:block">
            <table className="w-full border-collapse border border-black">
              <tbody>
                <tr>
                  <td className="border border-black px-2 py-2 align-top">
                    <div className="whitespace-pre-wrap">{formData.comments}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediumVoltageSwitchSF6Report;

