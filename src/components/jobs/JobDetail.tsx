import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Users, ChevronDown, Plus, Paperclip, X, FileEdit, Pencil, Upload, FileText, Package, Trash2, ClipboardCheck, Calendar, DollarSign, Building, User, Phone, Mail, MapPin, Clock, AlertTriangle, CheckCircle, Image, Maximize2, Minimize2, Save, Edit3, Download, Eye } from 'lucide-react';
import { supabase, isConnectionError } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useJobDetails } from '../../lib/hooks';
import { format } from 'date-fns';
import { Button } from '../ui/Button';
import { reportImportService } from '../../services/reportImport';
import Card, { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/Table";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/Dialog";
import { toast } from '@/components/ui/toast';
import { ReportApprovalWorkflow } from '../reports/ReportApprovalWorkflow';
import JobSurveys from './JobSurveys';
import { pdfExportService } from '../../services/pdfExportService';

import { JobNotifications } from './JobNotifications';
// TrackingSection is defined locally below

interface Job {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  job_number: string | null;
  start_date: string | null;
  due_date: string | null;
  budget: number | null;
  customer_id: string;
  division?: string | null;
  customers: {
    id: string;
    name: string;
    company_name?: string | null;
    address?: string | null;
  };
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  is_primary: boolean;
}

interface Customer {
  id: string;
  name: string;
  company_name: string;
}

interface Asset {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
  template_type?: 'MTS' | 'ATS' | null;
  status?: 'in_progress' | 'ready_for_review' | 'approved' | 'issue';
}

interface RelatedOpportunity {
  id: string;
  quote_number: string;
}

interface Contract {
  id: string;
  name: string;
  type: 'main' | 'subcontract' | 'amendment' | 'change_order';
  file_url: string;
  uploaded_date: string;
  status: 'pending' | 'signed' | 'expired' | 'cancelled';
  value?: number;
  start_date?: string;
  end_date?: string;
  description?: string;
}

interface OneLineDrawing {
  id: string;
  name: string;
  file_url: string;
  thumbnail_url?: string;
  last_modified: string;
  version: number;
  status: 'draft' | 'approved' | 'revision_needed';
  description?: string;
}

const reportRoutes = {
  'Panelboard Report': 'panelboard-report',
  'LV Switch Multi Device Test': 'low-voltage-switch-multi-device-test',
  'LV Breaker Electronic Trip ATS Report': 'low-voltage-circuit-breaker-electronic-trip-ats-report',
  '35-Automatic Transfer Switch ATS': 'automatic-transfer-switch-ats-report',
  '2-Large Dry Type Xfmr. Insp. & Test MTS 23': 'large-dry-type-transformer-mts-report',
  '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test MTS': 'large-dry-type-xfmr-mts-report',
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { jobDetails } = useJobDetails(id);
  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobAssets, setJobAssets] = useState<Asset[]>([]);
  const [filteredJobAssets, setFilteredJobAssets] = useState<Asset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetStatusFilter, setAssetStatusFilter] = useState<'all' | 'in_progress' | 'approved' | 'issue'>('all');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [opportunity, setOpportunity] = useState<RelatedOpportunity | null>(null);
  const [isStatusEditing, setIsStatusEditing] = useState(false);
  const [isPriorityEditing, setIsPriorityEditing] = useState(false);
  const [isDueDateEditing, setIsDueDateEditing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempDueDate, setTempDueDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [currentTab, setCurrentTab] = useState('details');
  const [selectedAssetType, setSelectedAssetType] = useState<string>('document');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  // Basic manual tracker state
  type TrackingItem = { id: string; name: string; target: number; completed: number };
  const [trackingItems, setTrackingItems] = useState<TrackingItem[]>([]);
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [newItemTarget, setNewItemTarget] = useState<number>(1);
  const [selectedReportForTracker, setSelectedReportForTracker] = useState<string>('');
  const saveTimerRef = React.useRef<number | null>(null);

  // Initialize manual tracker from loaded job (support both old/new shapes)
  useEffect(() => {
    const plan = (jobDetails as any)?.tracking_plan;
    if (!plan) { setTrackingItems([]); return; }
    if (Array.isArray(plan)) {
      const items = plan as any[];
      setTrackingItems(items.map((it, i) => ({
        id: it.id || `${i}-${Date.now()}`,
        name: it.name || it.slug || `Item ${i + 1}`,
        target: Number(it.target) || 1,
        completed: Number(it.completed) || 0,
      })));
    } else if (plan && Array.isArray(plan.items)) {
      const items = plan.items as any[];
      setTrackingItems(items.map((it, i) => ({
        id: it.id || `${i}-${Date.now()}`,
        name: it.name || it.slug || `Item ${i + 1}`,
        target: Number(it.target) || 1,
        completed: Number(it.completed) || 0,
      })));
    } else if (typeof plan === 'object') {
      const entries = Object.entries(plan as Record<string, number>);
      setTrackingItems(entries.map(([key, value], i) => ({
        id: `${i}-${Date.now()}`,
        name: key,
        target: Number(value) || 1,
        completed: 0,
      })));
    }
  }, [jobDetails?.tracking_plan]);

  // Manual tracker helpers
  const addItem = () => {
    if (!selectedReportForTracker) return;
    const target = Math.max(1, Math.floor(newItemTarget || 1));
    const asset = defaultAssets.find(a => a.id === selectedReportForTracker);
    const name = asset ? asset.name : selectedReportForTracker;
    // Avoid duplicate by name
    setTrackingItems(prev => {
      if (prev.some(it => it.name === name)) return prev;
      return [...prev, { id: `${Date.now()}`, name, target, completed: 0 }];
    });
    setSelectedReportForTracker('');
    setNewItemTarget(1);
    requestSave();
  };

  const updateItemTarget = (id: string, target: number) => {
    setTrackingItems(prev => prev.map(it => it.id === id ? { ...it, target: Math.max(0, Math.floor(target || 0)) } : it));
    requestSave();
  };

  const updateItemCompleted = (id: string, completed: number) => {
    setTrackingItems(prev => prev.map(it => it.id === id ? { ...it, completed: Math.max(0, Math.min(Math.floor(completed || 0), it.target)) } : it));
    requestSave();
  };

  const incCompleted = (id: string, delta: number) => {
    setTrackingItems(prev => prev.map(it => it.id === id ? { ...it, completed: Math.max(0, Math.min(it.completed + delta, it.target)) } : it));
    requestSave();
  };

  const removeItem = (id: string) => {
    setTrackingItems(prev => prev.filter(it => it.id !== id));
    requestSave();
  };

  const requestSave = () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      handleSaveTrackingPlan();
    }, 600);
  };

  const handleSaveTrackingPlan = async () => {
    if (!id) return;
    try {
      setIsSavingTracking(true);
      const { error: updateError } = await supabase
        .schema('neta_ops')
        .from('jobs')
        .update({ tracking_plan: { items: trackingItems } })
        .eq('id', id);
      if (updateError) throw updateError;
      toast({ title: 'Tracking plan saved', description: 'Your project tracking plan has been updated.' });
    } catch (err) {
      console.error('Failed to save tracking plan', err);
      toast({ title: 'Error', description: 'Failed to save tracking plan', variant: 'destructive' });
    } finally {
      setIsSavingTracking(false);
    }
  };
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Contract and Drawing Management State
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [oneLineDrawings, setOneLineDrawings] = useState<OneLineDrawing[]>([]);
  const [showContractUpload, setShowContractUpload] = useState(false);
  const [showDrawingUpload, setShowDrawingUpload] = useState(false);
  const [showDrawingViewer, setShowDrawingViewer] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<OneLineDrawing | null>(null);
  const [contractForm, setContractForm] = useState({
    name: '',
    type: 'main' as Contract['type'],
    description: '',
    value: '',
    start_date: '',
    end_date: ''
  });
  const [drawingForm, setDrawingForm] = useState({
    name: '',
    description: ''
  });
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [isContractUploading, setIsContractUploading] = useState(false);
  const [isDrawingUploading, setIsDrawingUploading] = useState(false);
  
  // Default assets that are always available
  const defaultAssets: Asset[] = [
    {
      id: 'switchgear-panelboard-mts',
      name: '1-Switchgear, Switchboard, Panelboard Inspection & Test Report MTS',
      file_url: `report:/jobs/${id}/switchgear-panelboard-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'large-dry-type-transformer-mts-report',
      name: '2-Large Dry Type Xfmr. Inspection and Test MTS 23',
      file_url: `report:/jobs/${id}/large-dry-type-transformer-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'large-dry-type-xfmr-mts-report',
      name: '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test MTS',
      file_url: `report:/jobs/${id}/large-dry-type-xfmr-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'liquid-xfmr-visual-mts-report',
      name: '2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test MTS',
      file_url: `report:/jobs/${id}/liquid-xfmr-visual-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'low-voltage-cable-test-3sets-mts',
      name: '3-Low Voltage Cable MTS',
      file_url: `report:/jobs/${id}/low-voltage-cable-test-3sets?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'electrical-tan-delta-test-mts-form',
      name: '4-Medium Voltage Cable VLF Tan Delta MTS',
      file_url: `report:/jobs/${id}/electrical-tan-delta-test-mts-form?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'switchgear-inspection-report',
      name: '1-Switchgear, Switchboard, Panelboard Inspection & Test Report ATS 21',
      file_url: `report:/jobs/${id}/switchgear-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'panelboard-inspection-report',
      name: '1-Panelboard Inspection & Test Report ATS 21',
      file_url: `report:/jobs/${id}/panelboard-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'dry-type-transformer-test',
      name: '2-Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
      file_url: `report:/jobs/${id}/dry-type-transformer?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'large-dry-type-transformer-test',
      name: '2-Large Dry Type Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
      file_url: `report:/jobs/${id}/large-dry-type-transformer-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'liquid-filled-transformer-test',
      name: '2-Liquid Filled Xfmr. Visual, Mechanical, Insulation Resistance Test ATS 21',
      file_url: `report:/jobs/${id}/liquid-filled-transformer?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'two-small-dry-typer-xfmr-ats-report',
      name: '2-Small Dry Typer Xfmr. Inspection and Test ATS',
      file_url: `report:/jobs/${id}/two-small-dry-typer-xfmr-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-cable-test-12sets',
      name: '3-Low Voltage Cable Test ATS',
      file_url: `report:/jobs/${id}/low-voltage-cable-test-12sets?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'medium-voltage-vlf-tan-delta',
      name: '4-Medium Voltage Cable VLF Tan Delta Test ATS',
      file_url: `report:/jobs/${id}/medium-voltage-vlf-tan-delta?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'medium-voltage-vlf-tan-delta-mts',
      name: '4-Medium Voltage Cable VLF Tan Delta Test MTS',
      file_url: `report:/jobs/${id}/medium-voltage-vlf-tan-delta-mts?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'medium-voltage-vlf',
      name: '4-Medium Voltage Cable VLF Test ATS',
      file_url: `report:/jobs/${id}/medium-voltage-vlf?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'medium-voltage-cable-vlf-test',
      name: '4-Medium Voltage Cable VLF Test With Tan Delta ATS',
      file_url: `report:/jobs/${id}/medium-voltage-cable-vlf-test?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'metal-enclosed-busway',
      name: '5-Metal Enclosed Busway ATS',
      file_url: `report:/jobs/${id}/metal-enclosed-busway?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-switch-multi-device-test',
      name: '6-Low Voltage Switch - Multi-Device TEST',
      file_url: `report:/jobs/${id}/low-voltage-switch-multi-device-test?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-switch-report',
      name: '6-Low Voltage Switch ATS',
      file_url: `report:/jobs/${id}/low-voltage-switch-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'mv-switch-oil-report',
      name: '7-Medium Voltage Way Switch (OIL) Report ATS 21',
      file_url: `report:/jobs/${id}/medium-voltage-switch-oil-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-circuit-breaker-electronic-trip-unit-ats',
      name: '8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Secondary Injection',
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-circuit-breaker-electronic-trip-ats-primary-injection',
      name: '8-Low Voltage Circuit Breaker Electronic Trip Unit ATS - Primary Injection',
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-electronic-trip-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-circuit-breaker-thermal-magnetic-ats',
      name: '8-Low Voltage Circuit Breaker Thermal-Magnetic ATS',
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-thermal-magnetic-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'low-voltage-panelboard-small-breaker-report',
      name: '8-Low Voltage Panelboard Small Breaker Test ATS (up to 60 individual breakers)',
      file_url: `report:/jobs/${id}/low-voltage-panelboard-small-breaker-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'medium-voltage-circuit-breaker-report',
      name: '9-Medium Voltage Circuit Breaker Test Report ATS',
      file_url: `report:/jobs/${id}/medium-voltage-circuit-breaker-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'current-transformer-test-ats-report',
      name: '12-Current Transformer Test ATS (partial, single CT)',
      file_url: `report:/jobs/${id}/current-transformer-test-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'new-current-transformer-test-ats-report',
      name: '12-Current Transformer Test ATS',
      file_url: `report:/jobs/${id}/12-current-transformer-test-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'automatic-transfer-switch-ats-report',
      name: '35-Automatic Transfer Switch ATS',
      file_url: `report:/jobs/${id}/automatic-transfer-switch-ats-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'ATS'
    },
    {
      id: 'medium-voltage-vlf-mts-report',
      name: '4-Medium Voltage Cable VLF Test Report MTS',
      file_url: `report:/jobs/${id}/medium-voltage-vlf-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'medium-voltage-cable-vlf-test-mts',
      name: '4-Medium Voltage Cable VLF Test With Tan Delta MTS',
      file_url: `report:/jobs/${id}/medium-voltage-cable-vlf-test-mts?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'low-voltage-circuit-breaker-electronic-trip-mts-report',
      name: '8-Low Voltage Circuit Breaker Electronic Trip Unit MTS - Primary Injection',
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-electronic-trip-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'low-voltage-circuit-breaker-thermal-magnetic-mts-report',
      name: '8-Low Voltage Circuit Breaker Thermal-Magnetic MTS',
      file_url: `report:/jobs/${id}/low-voltage-circuit-breaker-thermal-magnetic-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'medium-voltage-circuit-breaker-mts-report',
      name: '9-Medium Voltage Circuit Breaker Test Report MTS',
      file_url: `report:/jobs/${id}/medium-voltage-circuit-breaker-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: '12-current-transformer-test-mts-report',
      name: '12-Current Transformer Test MTS',
      file_url: `report:/jobs/${id}/12-current-transformer-test-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: '13-voltage-potential-transformer-test-mts-report',
      name: '13-Voltage Potential Transformer Test MTS',
      file_url: `report:/jobs/${id}/13-voltage-potential-transformer-test-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: '23-medium-voltage-motor-starter-mts-report',
      name: '23-Medium Voltage Motor Starter MTS Report',
      file_url: `report:/jobs/${id}/23-medium-voltage-motor-starter-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    },
    {
      id: 'two-small-dry-typer-xfmr-mts-report',
      name: '2-Small Dry Typer Xfmr. Inspection and Test MTS',
      file_url: `report:/jobs/${id}/two-small-dry-typer-xfmr-mts-report?returnToAssets=true`,
      created_at: new Date().toISOString(),
      template_type: 'MTS'
    }
  ];

  // (Manual tracker) no report slugs needed

  // Build default tracking types (from Add Asset menu templates)
  const defaultTypes = useMemo(() => {
    const typeSet = new Map<string, string>();
    const extractSlug = (fileUrl: string): string | null => {
      if (!fileUrl?.startsWith('report:/jobs/')) return null;
      const parts = fileUrl.replace('report:/jobs/', '').split('/');
      return parts[1] || null;
    };
    defaultAssets.forEach(a => {
      const slug = extractSlug(a.file_url);
      if (slug) typeSet.set(slug, a.name);
    });
    return Array.from(typeSet.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [id]);

  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState(0);
  const [printStatus, setPrintStatus] = useState('');

  // Handle clicking outside the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    
    // Add event listener only if dropdown is open
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    // Clean up
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Check for tab query parameter and update the active tab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['overview', 'assets', 'surveys', 'sla', 'tracking'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  useEffect(() => {
    if (user && id) {
      // If we have job details from the hook, use them
      if (jobDetails) {
        // Create a compatible job object from jobDetails
        const jobFromDetails: Job = {
          id: jobDetails.id,
          customer_id: jobDetails.customer?.id || '',
          title: jobDetails.title,
          description: jobDetails.description || '',
          status: jobDetails.status,
          priority: jobDetails.priority || 'medium',
          job_number: jobDetails.job_number,
          start_date: jobDetails.start_date || null,
          due_date: jobDetails.due_date || null,
          budget: jobDetails.budget || null,
          division: (jobDetails as any).division || null,
          customers: jobDetails.customer ? {
            id: jobDetails.customer.id,
            name: jobDetails.customer.name,
            company_name: jobDetails.customer.company_name,
            address: (jobDetails.customer as any).address,
          } : {
            id: '',
            name: '',
            company_name: null,
          }
        };
        
        setJob(jobFromDetails);
        
        if (jobDetails.customer) {
          setCustomer({
            id: jobDetails.customer.id,
            name: jobDetails.customer.name,
            company_name: jobDetails.customer.company_name || '',
          });
        }
        
        // Still need to fetch contacts
        fetchContacts(jobDetails.customer?.id);
        setLoading(false);
      } else {
        // Fallback to original fetching
        // fetchJobDetails(); 
      }
      
      // These fetches might still be needed if useJobDetails doesn't cover them
      fetchAssets(); 
      fetchJobAssets();
      
      // Fetch related opportunity if exists
      const fetchRelatedOpportunity = async () => {
        const opportunityData = await fetchOpportunityForJob(id); 
        setOpportunity(opportunityData);
      };
      
      fetchRelatedOpportunity();
    }
  }, [user, id, jobDetails]); // Depend on jobDetails from the hook

  useEffect(() => {
    if (job && !editFormData) {
      console.log('Setting edit form data with dates:', { 
        start_date: job.start_date, 
        due_date: job.due_date 
      });
      
      // Use normalized dates when initializing edit form
      setEditFormData({
        ...job,
        start_date: normalizeDate(job.start_date),
        due_date: normalizeDate(job.due_date)
      });
    }
  }, [job]);

  // Helper function to normalize date format
  function normalizeDate(dateString: string | null) {
    if (!dateString) return '';
    // Convert to YYYY-MM-DD for input elements
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0];
    } catch (error) {
      console.error('Date normalization error:', error);
      return '';
    }
  }

  useEffect(() => {
    // Filter job assets when search query or status filter changes
    let filtered = jobAssets;
    
    // Apply search filter
    if (searchQuery.trim() !== '') {
      filtered = filtered.filter(asset => 
        asset.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply status filter
    if (assetStatusFilter === 'in_progress') {
      // Include both in_progress and ready_for_review in the "In Progress" tab
      filtered = filtered.filter(asset => 
        !asset.status || asset.status === 'in_progress' || asset.status === 'ready_for_review'
      );
    } else if (assetStatusFilter === 'approved') {
      filtered = filtered.filter(asset => asset.status === 'approved');
    } else if (assetStatusFilter === 'issue') {
      filtered = filtered.filter(asset => asset.status === 'issue');
    }
    // 'all' shows everything, so no additional filtering needed
    
    setFilteredJobAssets(filtered);
  }, [searchQuery, jobAssets, assetStatusFilter]);

  // Filter report templates based on search
  const filteredReportTemplates = reportSearchQuery.trim() === '' 
    ? defaultAssets 
    : defaultAssets.filter(asset => 
        asset.name.toLowerCase().includes(reportSearchQuery.toLowerCase())
      );

  async function fetchAssets() {
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('assets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error('Error fetching assets:', error);
    }
  }

  async function fetchJobAssets() {
    if (!id) return;
    try {
      // 1. Fetch asset IDs associated with the job
      const { data: jobAssetLinks, error: linksError } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .select('asset_id')
        .eq('job_id', id)
        .limit(100000);

      if (linksError) {
        console.error('Error fetching job asset links:', linksError);
        throw linksError;
      }

      if (!jobAssetLinks || jobAssetLinks.length === 0) {
        setJobAssets([]);
        setFilteredJobAssets([]);
        return;
      }

      const assetIds = jobAssetLinks.map(link => link.asset_id);

      // 2. Fetch the details of those assets
      const { data: assetsData, error: assetsError } = await supabase
        .schema('neta_ops')
        .from('assets')
        .select('id, name, file_url, created_at, status')
        .in('id', assetIds);

      if (assetsError) {
        console.error('Error fetching linked assets:', assetsError);
        throw assetsError;
      }

      setJobAssets(assetsData || []);
      setFilteredJobAssets(assetsData || []);
    } catch (error) {
      console.error('Error fetching job assets:', error);
    }
  }

  async function fetchContacts(customerId?: string) {
    if (!customerId) {
      setContacts([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .schema('common') // Add schema
        .from('contacts')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false }); // Order by primary contact first

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setContacts([]);
    }
  }

  async function fetchOpportunityForJob(jobId: string) {
    if (!jobId) return null;
    try {
      const { data, error } = await supabase
        .schema('business') // Add schema
        .from('opportunities')
        .select('id, quote_number') // Removed division
        .eq('job_id', jobId)
        .maybeSingle(); // Use maybeSingle as there might not be a linked opportunity

      if (error) {
        console.error('Error fetching related opportunity:', error);
        return null;
      }
      return data as RelatedOpportunity | null;
    } catch (error) {
      console.error('Catch block: Error fetching related opportunity:', error);
      return null;
    }
  }

  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
  };

  const handleEditSubmit = async () => {
    if (!editFormData || !id) return;

    try {
      setError(null);
      
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          title: editFormData.title,
          description: editFormData.description,
          status: editFormData.status,
          priority: editFormData.priority,
          start_date: editFormData.start_date,
          due_date: editFormData.due_date,
          budget: editFormData.budget,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateError) throw updateError;

      // Update the local job state with the new data
      setJob(prev => prev ? {...prev, ...editFormData} : null);
      
      // Exit edit mode
      setIsEditing(false);
      setEditFormData(null);
      
      toast({ title: 'Success', description: 'Job updated successfully!', variant: 'success' });
    } catch (err) {
      console.error('Error updating job:', err);
      setError('Failed to update job. Please try again.');
    }
  };

  // Handle file change for asset upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle file upload for adding a new asset
  const handleFileUpload = async () => {
    if (!id) {
      toast({ title: 'Error', description: 'Job ID is missing', variant: 'destructive' });
      return;
    }

    // If a report template is selected
    if (selectedAssetType !== 'document') {
      const selectedReport = defaultAssets.find(asset => asset.id === selectedAssetType);
      if (selectedReport) {
        // Navigate to the report page
        navigate(selectedReport.file_url.replace('report:', ''));
        return;
      }
    }

    // For document uploads
    if (!selectedFile || !newAssetName.trim()) {
      toast({ title: 'Error', description: 'Please provide a file and asset name', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Upload file to Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `job-assets/${id}/${fileName}`;

      // Set progress to show activity
      setUploadProgress(10);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;
      
      // Update progress after upload
      setUploadProgress(70);

      // 2. Get public URL for the file
      const { data: publicUrlData } = supabase.storage
        .from('assets')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      // 3. Create asset record in database
      const { data: assetData, error: assetError } = await supabase
        .schema('neta_ops')
        .from('assets')
        .insert({
          name: newAssetName,
          file_url: publicUrl,
          created_at: new Date().toISOString(),
          status: 'in_progress',
        })
        .select('id')
        .single();

      if (assetError) throw assetError;
      
      // Update progress
      setUploadProgress(90);

      // 4. Create job-asset link
      const { error: linkError } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .insert({
          job_id: id,
          asset_id: assetData.id,
        });

      if (linkError) throw linkError;
      
      // Complete progress
      setUploadProgress(100);

      // 5. Update the UI
      fetchAssets();
      fetchJobAssets();
      
      // 6. Reset form
      setSelectedFile(null);
      setNewAssetName('');
      setSelectedAssetType('document');
      setIsDropdownOpen(false);
      setShowUploadDialog(false);
      toast({ title: 'Success', description: 'Asset added successfully', variant: 'success' });
    } catch (error) {
      console.error('Error uploading asset:', error);
      toast({ title: 'Error', description: 'Failed to upload asset. Please try again.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 500); // Reset after a delay to show completion
    }
  };

  // Handle report import function
  const handleImportReport = () => {
    // Create a hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,.amp-report';
    fileInput.style.display = 'none';
    
    fileInput.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        
        try {
          // Read the JSON file
          const text = await file.text();
          const reportData = JSON.parse(text);
          
          if (!id || !user?.id) {
            toast({ title: 'Error', description: 'Job ID or user ID is missing', variant: 'destructive' });
            return;
          }
          
          // Import the report using the report import service
          const result = await reportImportService.importReport(reportData, id, user.id);
          
          if (result.success && result.reportId) {
            // Create an asset entry for the imported report
            const assetData = {
              name: `Imported ${result.reportType || 'Report'} - ${file.name.replace('.json', '').replace('.amp-report', '')}`,
              file_url: `report:/jobs/${id}/${result.reportType || 'report'}/${result.reportId}`,
              user_id: user.id,
              created_at: new Date().toISOString()
            };

            const { data: assetResult, error: assetError } = await supabase
              .schema('neta_ops')
              .from('assets')
              .insert(assetData)
              .select('id')
              .single();

            if (assetError) throw assetError;

            // Link asset to job
            await supabase
              .schema('neta_ops')
              .from('job_assets')
              .insert({
                job_id: id,
                asset_id: assetResult.id,
                user_id: user.id
              });

            // Refresh the UI
            fetchJobAssets();
            
            toast({ 
              title: 'Success', 
              description: `Report imported successfully as ${result.reportType || 'report'}`, 
              variant: 'success' 
            });
          } else {
            throw new Error(result.error || 'Failed to import report');
          }
        } catch (error) {
          console.error('Error importing report:', error);
          toast({ 
            title: 'Error', 
            description: `Failed to import report: ${error instanceof Error ? error.message : 'Unknown error'}`, 
            variant: 'destructive' 
          });
        }
      }
    };
    
    // Trigger file selection
    fileInput.click();
    
    // Clean up
    fileInput.remove();
  };

  // Handle delete asset function
  const handleDeleteAsset = async () => {
    if (!assetToDelete || !id) {
      toast({ title: 'Error', description: 'Unable to delete asset', variant: 'destructive' });
      return;
    }

    try {
      // 1. Remove the job-asset link
      const { error: linkError } = await supabase
        .schema('neta_ops')
        .from('job_assets')
        .delete()
        .eq('job_id', id)
        .eq('asset_id', assetToDelete.id);

      if (linkError) throw linkError;

      // 2. If this is a document (not a report), delete the asset record and file
      if (!assetToDelete.file_url.startsWith('report:')) {
        // Get the storage file path from the URL
        const url = new URL(assetToDelete.file_url);
        const filePath = url.pathname.substring(url.pathname.indexOf('assets/') + 7);
        
        if (filePath) {
          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('assets')
            .remove([filePath]);
            
          if (storageError) {
            console.error('Error deleting file from storage:', storageError);
          }
        }

        // Delete asset record
        const { error: assetError } = await supabase
          .schema('neta_ops')
          .from('assets')
          .delete()
          .eq('id', assetToDelete.id);

        if (assetError) throw assetError;
      }

      // 3. Refresh the UI
      fetchJobAssets();
      
      // 4. Reset state and notify user
      setAssetToDelete(null);
      setShowDeleteConfirm(false);
      toast({ title: 'Success', description: 'Asset removed successfully', variant: 'success' });
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast({ title: 'Error', description: 'Failed to delete asset. Please try again.', variant: 'destructive' });
    }
  };

  const handleStatusUpdate = async (assetId: string, newStatus: Asset['status']) => {
    try {
      const asset = jobAssets.find(a => a.id === assetId);
      const currentStatus = asset?.status;

      // If moving FROM "ready_for_review" back to "in_progress", remove from approval workflow
      if (currentStatus === 'ready_for_review' && newStatus === 'in_progress') {
        // Confirm with user before removing from approval workflow
        const confirmed = confirm(
          'This will remove the report from the approval workflow. ' +
          'Are you sure you want to change the status back to "In Progress"?'
        );
        
        if (!confirmed) {
          return; // User cancelled, don't proceed with status change
        }

        // Import the report service functions
        const { getReportByAssetId, deleteReport } = await import('@/lib/services/reportService');
        
        // Find the associated technical report
        console.log('Looking for technical report for asset ID:', assetId);
        const reportResult = await getReportByAssetId(assetId);
        console.log('Report lookup result:', reportResult);
        
        if (reportResult.data) {
          console.log('Found technical report, attempting to delete:', reportResult.data.id);
          // Delete the technical report and its links
          const deleteResult = await deleteReport(reportResult.data.id);
          console.log('Delete result:', deleteResult);
          
          if (deleteResult.error) {
            console.error('Failed to remove report from approval workflow:', deleteResult.error);
            alert(`Warning: Failed to remove report from approval workflow: ${deleteResult.error && typeof deleteResult.error === 'object' && 'message' in deleteResult.error ? (deleteResult.error as any).message : 'Unknown error'}`);
            // Don't throw error here - still allow status update to proceed
          } else {
            console.log('Successfully removed report from approval workflow');
            alert('Report has been removed from the approval workflow.');
          }
        } else {
          console.log('No technical report found for this asset');
          if (reportResult.error) {
            console.error('Error looking up technical report:', reportResult.error);
          }
        }
      }
      
      // If moving to "ready_for_review", create a technical report entry
      if (newStatus === 'ready_for_review') {
        if (asset && asset.file_url.startsWith('report:')) {
          // Create a technical report entry for approval workflow
          const reportData = {
            job_id: id!,
            title: asset.name,
            report_type: asset.template_type || 'Technical Report',
            report_data: {
              asset_id: assetId,
              file_url: asset.file_url,
              asset_name: asset.name
            }
          };

          // Import the report service
          const { createDraftReport, submitReportForApproval } = await import('@/lib/services/reportService');
          
          // Create draft and immediately submit for approval
          const draftResult = await createDraftReport(reportData, user?.id || '');
          if (draftResult.error) {
            throw new Error(`Failed to create report entry: ${JSON.stringify(draftResult.error)}`);
          }
          
          // Submit for approval
          const submitResult = await submitReportForApproval(draftResult.data!.id, user?.id || '', 'Asset submitted for review');
          if (submitResult.error) {
            throw new Error(`Failed to submit for approval: ${JSON.stringify(submitResult.error)}`);
          }

          // Link asset to technical report
          const { error: linkError } = await supabase
            .schema('neta_ops')
            .from('asset_reports')
            .insert({
              asset_id: assetId,
              report_id: draftResult.data!.id
            });

          if (linkError) {
            console.warn('Warning: Failed to link asset to report:', linkError);
          }
        }
      }

      const { error } = await supabase
        .schema('neta_ops')
        .from('assets')
        .update({ status: newStatus })
        .eq('id', assetId);

      if (error) {
        console.error('Error updating asset status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }

      // Update local state
      setJobAssets(prev => prev.map(asset => 
        asset.id === assetId ? { ...asset, status: newStatus } : asset
      ));
      setFilteredJobAssets(prev => prev.map(asset => 
        asset.id === assetId ? { ...asset, status: newStatus } : asset
      ));
      
    } catch (error) {
      console.error('Error in handleStatusUpdate:', error);
      alert(`Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getReportEditPath = (asset: Asset) => {
    const urlContent = asset.file_url.split(':/')[1];
    const pathSegments = urlContent.split('/');

    if (pathSegments[0] !== 'jobs' || !pathSegments[1] || !pathSegments[2]) {
      console.error('Unexpected asset.file_url format for report path:', asset.file_url, 'Expected format like "report:/jobs/JOB_ID/report-slug..."');
      return `/jobs/${id}`; // Fallback to current job detail page
    }

    const jobIdSegment = pathSegments[1]; // This is the job ID from the asset's URL
    let reportNameSlug = pathSegments[2];
    const reportIdFromUrl = pathSegments[3]; // This might be an actual ID or undefined

    // Clean query parameters from reportNameSlug if it's the last significant path part before query
    if (reportNameSlug.includes('?')) {
      reportNameSlug = reportNameSlug.split('?')[0];
    }
    
    // Comprehensive map of report slugs to their route segments
    // Keys should match the slug in defaultAssets.file_url (e.g., 'panelboard-report')
    // Values should be the route segment used in App.tsx (usually the same)
    const reportPathMap: { [key: string]: string } = {
      'panelboard-report': 'panelboard-report',
      'low-voltage-switch-multi-device-test': 'low-voltage-switch-multi-device-test',
      'low-voltage-circuit-breaker-electronic-trip-ats-report': 'low-voltage-circuit-breaker-electronic-trip-ats-report',
      'low-voltage-circuit-breaker-electronic-trip-mts-report': 'low-voltage-circuit-breaker-electronic-trip-mts-report',
      'automatic-transfer-switch-ats-report': 'automatic-transfer-switch-ats-report',
      'large-dry-type-transformer-mts-report': 'large-dry-type-transformer-mts-report',
      'large-dry-type-xfmr-mts-report': 'large-dry-type-xfmr-mts-report',
      'switchgear-panelboard-mts-report': 'switchgear-panelboard-mts-report',
      'liquid-xfmr-visual-mts-report': 'liquid-xfmr-visual-mts-report',
      'switchgear-report': 'switchgear-report',
      'dry-type-transformer': 'dry-type-transformer',
      'large-dry-type-transformer': 'large-dry-type-transformer', // Added based on App.tsx routes
      'large-dry-type-transformer-report': 'large-dry-type-transformer-report',
      'liquid-filled-transformer': 'liquid-filled-transformer',
      'oil-inspection': 'oil-inspection',
      'low-voltage-cable-test-12sets': 'low-voltage-cable-test-12sets',
      'low-voltage-cable-test-20sets': 'low-voltage-cable-test-20sets',
      'low-voltage-cable-test-3sets': 'low-voltage-cable-test-3sets',
      'medium-voltage-vlf-tan-delta': 'medium-voltage-vlf-tan-delta',
      'medium-voltage-vlf-tan-delta-mts': 'medium-voltage-vlf-tan-delta-mts',
      'medium-voltage-vlf': 'medium-voltage-vlf',
      'medium-voltage-cable-vlf-test': 'medium-voltage-cable-vlf-test',
      'metal-enclosed-busway': 'metal-enclosed-busway',
      'low-voltage-switch-report': 'low-voltage-switch-report',
      'medium-voltage-switch-oil-report': 'medium-voltage-switch-oil-report',
      'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report': 'low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report',
      'low-voltage-circuit-breaker-thermal-magnetic-ats-report': 'low-voltage-circuit-breaker-thermal-magnetic-ats-report',
      'low-voltage-circuit-breaker-thermal-magnetic-mts-report': 'low-voltage-circuit-breaker-thermal-magnetic-mts-report',
      'low-voltage-panelboard-small-breaker-report': 'low-voltage-panelboard-small-breaker-report',
      'medium-voltage-circuit-breaker-report': 'medium-voltage-circuit-breaker-report',
      'current-transformer-test-ats-report': 'current-transformer-test-ats-report',
      '12-current-transformer-test-ats-report': '12-current-transformer-test-ats-report',
      'oil-analysis-report': 'oil-analysis-report', // Added based on App.tsx routes
      'cable-hipot-test-report': 'cable-hipot-test-report', // Added based on App.tsx routes
      'relay-test-report': 'relay-test-report', // Added based on App.tsx routes
      'two-small-dry-typer-xfmr-ats-report': 'two-small-dry-typer-xfmr-ats-report',
      'medium-voltage-vlf-mts-report': 'medium-voltage-vlf-mts-report',
      'electrical-tan-delta-test-mts-form': 'electrical-tan-delta-test-mts-form',
      'medium-voltage-cable-vlf-test-mts': 'medium-voltage-cable-vlf-test-mts',
      'medium-voltage-circuit-breaker-mts-report': 'medium-voltage-circuit-breaker-mts-report',
      '12-current-transformer-test-mts-report': '12-current-transformer-test-mts-report',
      '13-voltage-potential-transformer-test-mts-report': '13-voltage-potential-transformer-test-mts-report',
      '23-medium-voltage-motor-starter-mts-report': '23-medium-voltage-motor-starter-mts-report',
      'two-small-dry-typer-xfmr-mts-report': 'two-small-dry-typer-xfmr-mts-report'
    };

    const mappedReportName = reportPathMap[reportNameSlug];

    if (!mappedReportName) {
      console.error('Unknown report type for path mapping. Slug:', reportNameSlug, 'Original URL:', asset.file_url, 'Asset ID:', asset.id);
      return `/jobs/${id}`; // Fallback
    }

    // Check if the asset is a template (for creating a new report) or an existing report.
    // Templates from defaultAssets typically won't have a reportId in their file_url path.
    // Existing assets (from jobAssets) will have a file_url like 'report:/jobs/JOB_ID/slug/REPORT_ID'.
    
    // A simple way to check if it's a template link: if asset.id is one of the predefined template IDs in defaultAssets
    const isTemplate = defaultAssets.some(da => da.id === asset.id && da.file_url.startsWith('report:'));

    if (isTemplate) {
      // For templates (new reports), navigate to the path without a reportId segment.
      // The jobIdSegment here is the current job's ID passed via the template literal in defaultAssets
      return `/jobs/${jobIdSegment}/${mappedReportName}`;
    } else if (reportIdFromUrl) {
      // For existing reports that have an ID in their URL structure.
      // Add returnToAssets=true so that when users navigate back, they go to the assets tab
      return `/jobs/${jobIdSegment}/${mappedReportName}/${reportIdFromUrl}?returnToAssets=true`;
    } else {
      // Fallback for existing assets that might have a malformed URL or if it's a template missed by the above check.
      // This primarily targets new reports from templates.
      console.warn('Asset is not a template and has no reportId in URL, defaulting to new report path:', asset.file_url);
      return `/jobs/${jobIdSegment}/${mappedReportName}?returnToAssets=true`;
    }
  };

  // Contract Management Functions
  const fetchContracts = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('job_contracts')
        .select('*')
        .eq('job_id', id)
        .order('uploaded_date', { ascending: false });
      
      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error('Error fetching contracts:', error);
    }
  };

  const handleContractUpload = async () => {
    if (!contractFile || !user?.id || !id) return;
    
    setIsContractUploading(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = contractFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `contracts/${id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('job-documents')
        .upload(filePath, contractFile);
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('job-documents')
        .getPublicUrl(filePath);
      
      // Save contract record
      const contractData = {
        job_id: id,
        name: contractForm.name || contractFile.name,
        type: contractForm.type,
        file_url: publicUrl,
        uploaded_date: new Date().toISOString(),
        status: 'pending' as const,
        value: contractForm.value ? parseFloat(contractForm.value) : null,
        start_date: contractForm.start_date || null,
        end_date: contractForm.end_date || null,
        description: contractForm.description || null,
        user_id: user.id
      };
      
      const { error: insertError } = await supabase
        .schema('neta_ops')
        .from('job_contracts')
        .insert(contractData);
      
      if (insertError) throw insertError;
      
      // Reset form and refresh contracts
      setContractForm({
        name: '',
        type: 'main',
        description: '',
        value: '',
        start_date: '',
        end_date: ''
      });
      setContractFile(null);
      setShowContractUpload(false);
      await fetchContracts();
      
      toast({ title: 'Success', description: 'Contract uploaded successfully!', variant: 'success' });
    } catch (error) {
      console.error('Error uploading contract:', error);
      toast({ title: 'Error', description: 'Failed to upload contract', variant: 'destructive' });
    } finally {
      setIsContractUploading(false);
    }
  };

  // Drawing Management Functions
  const fetchOneLineDrawings = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('job_drawings')
        .select('*')
        .eq('job_id', id)
        .order('last_modified', { ascending: false });
      
      if (error) throw error;
      setOneLineDrawings(data || []);
    } catch (error) {
      console.error('Error fetching drawings:', error);
    }
  };

  const handleDrawingUpload = async () => {
    if (!drawingFile || !user?.id || !id) return;
    
    setIsDrawingUploading(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = drawingFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `drawings/${id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('job-documents')
        .upload(filePath, drawingFile);
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('job-documents')
        .getPublicUrl(filePath);
      
      // Save drawing record
      const drawingData = {
        job_id: id,
        name: drawingForm.name || drawingFile.name,
        file_url: publicUrl,
        last_modified: new Date().toISOString(),
        version: 1,
        status: 'draft' as const,
        description: drawingForm.description || null,
        user_id: user.id
      };
      
      const { error: insertError } = await supabase
        .schema('neta_ops')
        .from('job_drawings')
        .insert(drawingData);
      
      if (insertError) throw insertError;
      
      // Reset form and refresh drawings
      setDrawingForm({
        name: '',
        description: ''
      });
      setDrawingFile(null);
      setShowDrawingUpload(false);
      await fetchOneLineDrawings();
      
      toast({ title: 'Success', description: 'Drawing uploaded successfully!', variant: 'success' });
    } catch (error) {
      console.error('Error uploading drawing:', error);
      toast({ title: 'Error', description: 'Failed to upload drawing', variant: 'destructive' });
    } finally {
      setIsDrawingUploading(false);
    }
  };

  const handleDrawingView = (drawing: OneLineDrawing) => {
    setSelectedDrawing(drawing);
    setShowDrawingViewer(true);
  };

  // Add to useEffect to fetch contracts and drawings
  useEffect(() => {
    if (user && id) {
      fetchContracts();
      fetchOneLineDrawings();
    }
  }, [user, id]);

  const handlePrintAllApprovedReports = async () => {
    // Prevent multiple simultaneous print operations
    if (isPrinting) {
      return;
    }

    setIsPrinting(true);
    setPrintProgress(0);
    setPrintStatus('');

    try {
      const approvedAssets = jobAssets.filter(asset => asset.status === 'approved' && asset.file_url?.startsWith('report:'));
      
      if (approvedAssets.length === 0) {
        toast({
          title: "No Approved Reports",
          description: "There are no approved reports to print.",
          variant: "destructive",
        });
        return;
      }

      await pdfExportService.batchPrintApprovedReports(
        approvedAssets,
        (progress: number, status: string) => {
          setPrintProgress(progress);
          setPrintStatus(status);
        }
      );

      toast({
        title: "PDF Generation Complete",
        description: `Successfully generated ${approvedAssets.length} PDF reports.`,
      });

    } catch (error: any) {
      console.error('Error printing reports:', error);
      toast({
        title: "Print Failed",
        description: error.message || "An unknown error occurred during printing.",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
      setPrintProgress(0);
      setPrintStatus('');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500 dark:text-gray-400">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500 dark:text-gray-400">Job not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <Button 
          variant="ghost"
          onClick={() => navigate('/jobs')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-5 w-5 min-w-[20px] flex-shrink-0" />
          Back to Jobs
        </Button>
        <div className="flex gap-2 items-center">
          {/* Add JobNotifications component */}
          {id && <JobNotifications jobId={id} />}
          
          <Button 
            variant="outline"
            onClick={() => {
              setIsEditing(true);
              setEditFormData(job);
            }}
            className="flex items-center gap-2"
          >
            <Pencil className="h-5 w-5 min-w-[20px] flex-shrink-0" />
            Edit Job
          </Button>
        </div>
      </div>

      <Card className="shadow-lg">
        {isEditing ? (
          <div>
            {/* Edit Form Header */}
            <CardHeader className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#f26722]/10 rounded-lg">
                  <Edit3 className="h-5 w-5 text-[#f26722]" />
                </div>
                <div>
                  <CardTitle className="text-xl text-gray-900 dark:text-white">Edit Job Details</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Update job information and settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-8">
              <form onSubmit={(e) => { e.preventDefault(); handleEditSubmit(); }} className="space-y-8">
                {/* Basic Information Section */}
                <div className="space-y-6">
                  <div className="border-l-4 border-[#f26722] pl-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Basic Information</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Job title and description</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label htmlFor="title" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Job Title *
                      </label>
                      <input
                        type="text"
                        id="title"
                        value={editFormData?.title || ''}
                        onChange={(e) => setEditFormData(prev => prev ? {...prev, title: e.target.value} : null)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-2 focus:ring-[#f26722]/20 dark:bg-dark-100 dark:text-white transition-all duration-200"
                        placeholder="Enter job title"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="description" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Description
                      </label>
                      <textarea
                        id="description"
                        rows={4}
                        value={editFormData?.description || ''}
                        onChange={(e) => setEditFormData(prev => prev ? {...prev, description: e.target.value} : null)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-2 focus:ring-[#f26722]/20 dark:bg-dark-100 dark:text-white transition-all duration-200 resize-vertical"
                        placeholder="Enter job description"
                      />
                    </div>
                  </div>
                </div>

                {/* Status and Priority Section */}
                <div className="space-y-6">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Status & Priority</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Job status and priority level</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="status" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Status *
                      </label>
                      <select
                        id="status"
                        value={editFormData?.status || ''}
                        onChange={(e) => setEditFormData(prev => prev ? {...prev, status: e.target.value} : null)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-2 focus:ring-[#f26722]/20 dark:bg-dark-100 dark:text-white transition-all duration-200"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    
                    <div>
                      <label htmlFor="priority" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Priority *
                      </label>
                      <select
                        id="priority"
                        value={editFormData?.priority || ''}
                        onChange={(e) => setEditFormData(prev => prev ? {...prev, priority: e.target.value} : null)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-2 focus:ring-[#f26722]/20 dark:bg-dark-100 dark:text-white transition-all duration-200"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Dates and Budget Section */}
                <div className="space-y-6">
                  <div className="border-l-4 border-green-500 pl-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Timeline & Budget</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Project dates and budget information</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label htmlFor="start_date" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        <Calendar className="inline h-4 w-4 mr-1" />
                        Start Date
                      </label>
                      <input
                        type="date"
                        id="start_date"
                        value={editFormData?.start_date?.substring(0, 10) || ''}
                        onChange={(e) => setEditFormData(prev => prev ? {...prev, start_date: e.target.value} : null)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-2 focus:ring-[#f26722]/20 dark:bg-dark-100 dark:text-white transition-all duration-200"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="due_date" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="inline h-4 w-4 mr-1" />
                        Due Date
                      </label>
                      <input
                        type="date"
                        id="due_date"
                        value={editFormData?.due_date?.substring(0, 10) || ''}
                        onChange={(e) => setEditFormData(prev => prev ? {...prev, due_date: e.target.value} : null)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-2 focus:ring-[#f26722]/20 dark:bg-dark-100 dark:text-white transition-all duration-200"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="budget" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        <DollarSign className="inline h-4 w-4 mr-1" />
                        Budget
                      </label>
                      <input
                        type="number"
                        id="budget"
                        step="0.01"
                        min="0"
                        value={editFormData?.budget || ''}
                        onChange={(e) => setEditFormData(prev => prev ? {...prev, budget: e.target.value ? Number(e.target.value) : null} : null)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm focus:border-[#f26722] focus:ring-2 focus:ring-[#f26722]/20 dark:bg-dark-100 dark:text-white transition-all duration-200"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
            </form>
            </CardContent>

            <CardFooter className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200 px-8 py-6">
              <div className="flex justify-between items-center w-full">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  * Required fields
                </p>
                <div className="flex space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditFormData(null);
                    }}
                    className="px-6 py-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-dark-100"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    onClick={handleEditSubmit}
                    className="px-6 py-2 bg-[#f26722] hover:bg-[#f26722]/90 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardFooter>
          </div>
        ) : (
          <div>
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{job.title}</h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Job #{job.job_number || 'Pending'}
                  </p>
                </div>
                {/* Additional job header details would go here */}
                    </div>
              {/* Additional job overview content would go here */}
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700">
              <div className="px-6">
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                    <button 
                    onClick={() => handleTabChange('overview')}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === 'overview'
                        ? 'border-b-2 border-[#f26722] text-[#f26722]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Overview
                    </button>
                  <button
                    onClick={() => handleTabChange('assets')}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === 'assets'
                        ? 'border-b-2 border-[#f26722] text-[#f26722]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Assets
                  </button>
                  <button
                    onClick={() => handleTabChange('reports')}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === 'reports'
                        ? 'border-b-2 border-[#f26722] text-[#f26722]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    } ${user?.user_metadata?.role !== 'Admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={user?.user_metadata?.role !== 'Admin'}
                  >
                    <ClipboardCheck className="h-5 w-5 min-w-[20px] flex-shrink-0 inline-block mr-1" />
                    Reports
                  </button>
                  <button
                    onClick={() => handleTabChange('surveys')}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === 'surveys'
                        ? 'border-b-2 border-[#f26722] text-[#f26722]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Surveys
                  </button>
                  <button
                    onClick={() => handleTabChange('tracking')}
                    className={`py-4 px-6 text-sm font-medium ${
                      activeTab === 'tracking'
                        ? 'border-b-2 border-[#f26722] text-[#f26722]'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Tracking
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Project Status Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Project Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center space-x-2">
                            <div className={`h-3 w-3 rounded-full ${
                              job.status === 'completed' ? 'bg-green-500' :
                              job.status === 'in_progress' ? 'bg-blue-500' :
                              job.status === 'pending' ? 'bg-yellow-500' :
                              'bg-gray-500'
                            }`} />
                            <span className="text-lg font-semibold capitalize text-gray-900 dark:text-white">
                              {job.status.replace('_', ' ')}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Priority</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center space-x-2">
                            {job.priority === 'high' ? <AlertTriangle className="h-4 w-4 text-red-500" /> :
                             job.priority === 'medium' ? <Clock className="h-4 w-4 text-yellow-500" /> :
                             <CheckCircle className="h-4 w-4 text-green-500" />}
                            <span className="text-lg font-semibold capitalize text-gray-900 dark:text-white">
                              {job.priority}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Budget</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center space-x-2">
                            <DollarSign className="h-4 w-4 text-green-500" />
                            <span className="text-lg font-semibold text-gray-900 dark:text-white">
                              ${job.budget?.toLocaleString() || 'Not set'}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Job Details & Customer Information */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Job Information */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <Building className="h-5 w-5 text-[#f26722]" />
                            <span>Job Information</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Job Number</label>
                            <p className="text-gray-900 dark:text-white font-mono">{job.job_number || 'Pending'}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Title</label>
                            <p className="text-gray-900 dark:text-white">{job.title}</p>
                          </div>
                          {job.description && (
                            <div>
                              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Description</label>
                              <p className="text-gray-900 dark:text-white text-sm">{job.description}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Start Date</label>
                              <div className="flex items-center space-x-2">
                                <Calendar className="h-4 w-4 text-gray-500" />
                                <p className="text-gray-900 dark:text-white text-sm">
                                  {job.start_date ? format(new Date(job.start_date), 'MMM d, yyyy') : 'Not set'}
                                </p>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Due Date</label>
                              <div className="flex items-center space-x-2">
                                <Calendar className="h-4 w-4 text-gray-500" />
                                <p className="text-gray-900 dark:text-white text-sm">
                                  {job.due_date ? format(new Date(job.due_date), 'MMM d, yyyy') : 'Not set'}
                                </p>
                              </div>
                            </div>
                          </div>
                          {job.division && (
                            <div>
                              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Division</label>
                              <p className="text-gray-900 dark:text-white capitalize">{job.division.replace('_', ' ')}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Customer Information */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <User className="h-5 w-5 text-[#f26722]" />
                            <span>Customer Information</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Company</label>
                            <p className="text-gray-900 dark:text-white font-semibold">
                              {job.customers.company_name || job.customers.name}
                            </p>
                          </div>
                          {job.customers.address && (
                            <div>
                              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Address</label>
                              <div className="flex items-start space-x-2">
                                <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                                <p className="text-gray-900 dark:text-white text-sm">{job.customers.address}</p>
                              </div>
                            </div>
                          )}
                          {contacts.length > 0 && (
                            <div>
                              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Primary Contact</label>
                              {contacts.filter(c => c.is_primary).map(contact => (
                                <div key={contact.id} className="space-y-2">
                                  <p className="text-gray-900 dark:text-white font-medium">
                                    {contact.first_name} {contact.last_name}
                                  </p>
                                  <div className="space-y-1">
                                    <div className="flex items-center space-x-2">
                                      <Mail className="h-4 w-4 text-gray-500" />
                                      <p className="text-gray-900 dark:text-white text-sm">{contact.email}</p>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Phone className="h-4 w-4 text-gray-500" />
                                      <p className="text-gray-900 dark:text-white text-sm">{contact.phone}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Contracts Section */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center space-x-2">
                            <FileText className="h-5 w-5 text-[#f26722]" />
                            <span>Contracts & Agreements</span>
                          </CardTitle>
                          <Button 
                            onClick={() => setShowContractUpload(true)}
                            className="flex items-center space-x-2"
                          >
                            <Upload className="h-4 w-4" />
                            <span>Upload Contract</span>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {contracts.length === 0 ? (
                          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No contracts uploaded yet</p>
                            <p className="text-sm">Upload your first contract to get started</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {contracts.map((contract) => (
                              <div key={contract.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-3">
                                      <FileText className="h-5 w-5 text-[#f26722]" />
                                      <div>
                                        <h4 className="font-medium text-gray-900 dark:text-white">{contract.name}</h4>
                                        <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                                          <span className="capitalize">{contract.type.replace('_', ' ')}</span>
                                          <Badge className={
                                            contract.status === 'signed' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                                            contract.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
                                            contract.status === 'expired' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' :
                                            'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                                          }>
                                            {contract.status}
                                          </Badge>
                                          {contract.value && (
                                            <span>${contract.value.toLocaleString()}</span>
                                          )}
                                          <span>{format(new Date(contract.uploaded_date), 'MMM d, yyyy')}</span>
                                        </div>
                                        {contract.description && (
                                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{contract.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => window.open(contract.file_url, '_blank')}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      View
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = contract.file_url;
                                        link.download = contract.name;
                                        link.click();
                                      }}
                                    >
                                      <Download className="h-4 w-4 mr-1" />
                                      Download
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* One-Line Drawings Section */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center space-x-2">
                            <Image className="h-5 w-5 text-[#f26722]" />
                            <span>One-Line Drawings</span>
                          </CardTitle>
                          <Button 
                            onClick={() => setShowDrawingUpload(true)}
                            className="flex items-center space-x-2"
                          >
                            <Upload className="h-4 w-4" />
                            <span>Upload Drawing</span>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {oneLineDrawings.length === 0 ? (
                          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No drawings uploaded yet</p>
                            <p className="text-sm">Upload your first one-line drawing to get started</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {oneLineDrawings.map((drawing) => (
                              <div key={drawing.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
                                <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg mb-3 flex items-center justify-center">
                                  {drawing.thumbnail_url ? (
                                    <img 
                                      src={drawing.thumbnail_url} 
                                      alt={drawing.name}
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                  ) : (
                                    <Image className="h-8 w-8 text-gray-400" />
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">{drawing.name}</h4>
                                    <Badge className={
                                      drawing.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                                      drawing.status === 'draft' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
                                      'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                                    }>
                                      {drawing.status.replace('_', ' ')}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    <p>Version {drawing.version}</p>
                                    <p>{format(new Date(drawing.last_modified), 'MMM d, yyyy')}</p>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => handleDrawingView(drawing)}
                                      className="flex-1"
                                    >
                                      <Maximize2 className="h-3 w-3 mr-1" />
                                      View
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => window.open(drawing.file_url, '_blank')}
                                    >
                                      <Edit3 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
                
                {activeTab === 'assets' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">Job Assets & Reports</h3>
                      <div className="flex space-x-2 relative" ref={dropdownRef}>
                        <Button 
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="flex items-center gap-2"
                        >
                          <Plus className="h-5 w-5 min-w-[20px] flex-shrink-0" />
                          Add Asset
                        </Button>
                        
                        {isDropdownOpen && (
                          <div className="absolute right-0 top-10 w-[32rem] rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
                            <div className="py-1" role="menu" aria-orientation="vertical">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                Upload Document
                              </div>
                              <button
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={() => {
                                  setShowUploadDialog(true);
                                  setIsDropdownOpen(false);
                                }}
                              >
                                <div className="flex items-center">
                                  <Upload className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                  Upload File
                                </div>
                              </button>
                              
                              <button
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={() => {
                                  handleImportReport();
                                  setIsDropdownOpen(false);
                                }}
                              >
                                <div className="flex items-center">
                                  <Download className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                  Upload Report
                                </div>
                              </button>
                              
                              <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                              
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                Create Report
                              </div>
                              
                              <div className="px-4 py-2">
                                <Input
                                  placeholder="Search reports..."
                                  value={reportSearchQuery}
                                  onChange={(e) => setReportSearchQuery(e.target.value)}
                                  className="w-full mb-2"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              
                              <div className="max-h-60 overflow-y-auto">
                                {filteredReportTemplates.length === 0 ? (
                                  <div className="px-4 py-2 text-sm text-gray-500">
                                    No matching reports found
                                  </div>
                                ) : (
                                  <>
                                    {/* ATS Reports Section */}
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700">
                                      ATS Reports
                                    </div>
                                    {filteredReportTemplates
                                      .filter(asset => asset.template_type === 'ATS')
                                      .map((asset) => (
                                        <Link 
                                          key={asset.id}
                                          to={getReportEditPath(asset)}
                                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                          onClick={() => setIsDropdownOpen(false)}
                                        >
                                          <div className="flex items-center">
                                            <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                            <span className="truncate">{asset.id === 'low-voltage-cable-test-12sets' ? '3-Low Voltage Cable Test ATS' : asset.name}</span>
                                          </div>
                                        </Link>
                                      ))}
                                    
                                    {/* MTS Reports Section */}
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700">
                                      MTS Reports
                                    </div>
                                    {filteredReportTemplates
                                      .filter(asset => asset.template_type === 'MTS')
                                      .map((asset) => (
                                        <Link 
                                          key={asset.id}
                                          to={getReportEditPath(asset)}
                                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                          onClick={() => setIsDropdownOpen(false)}
                                        >
                                          <div className="flex items-center">
                                            <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                            <span className="truncate">{asset.id === 'low-voltage-cable-test-12sets' ? '3-Low Voltage Cable Test ATS' : asset.name}</span>
                                          </div>
                                        </Link>
                                      ))}
                                    
                                    {/* Other Reports (if any without specific template_type) */}
                                    {filteredReportTemplates.some(asset => !asset.template_type) && (
                                      <>
                                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700">
                                          Other Reports
                                        </div>
                                        {filteredReportTemplates
                                          .filter(asset => !asset.template_type)
                                          .map((asset) => (
                                            <Link 
                                              key={asset.id}
                                              to={getReportEditPath(asset)}
                                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                              onClick={() => setIsDropdownOpen(false)}
                                            >
                                              <div className="flex items-center">
                                                <FileText className="h-5 w-5 min-w-[20px] mr-2 flex-shrink-0" />
                                                <span className="truncate">{asset.id === 'low-voltage-cable-test-12sets' ? '3-Low Voltage Cable Test ATS' : asset.name}</span>
                                              </div>
                                            </Link>
                                          ))}
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Linked assets section */}
                    <Card>
                      <CardHeader>
                        <div className="flex justify-between">
                          <div>
                            <CardTitle>Linked Assets</CardTitle>
                            <CardDescription>
                              Assets and documents that have been linked to this job
                            </CardDescription>
                          </div>
                          <div className="w-1/3">
                            <Input
                              placeholder="Search assets..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="w-full"
                            />
                          </div>
                        </div>
                        
                        {/* Status filter tabs */}
                        <div className="mt-4">
                          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                            <button
                              onClick={() => setAssetStatusFilter('all')}
                              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                assetStatusFilter === 'all'
                                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                              }`}
                            >
                              All ({jobAssets.length})
                            </button>
                            <button
                              onClick={() => setAssetStatusFilter('in_progress')}
                              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                assetStatusFilter === 'in_progress'
                                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                              }`}
                            >
                              In Progress ({jobAssets.filter(asset => !asset.status || asset.status === 'in_progress' || asset.status === 'ready_for_review').length})
                            </button>
                            <button
                              onClick={() => setAssetStatusFilter('approved')}
                              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                assetStatusFilter === 'approved'
                                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                              }`}
                            >
                              Approved ({jobAssets.filter(asset => asset.status === 'approved').length})
                            </button>
                            <button
                              onClick={() => setAssetStatusFilter('issue')}
                              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                assetStatusFilter === 'issue'
                                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                              }`}
                            >
                              Issues ({jobAssets.filter(asset => asset.status === 'issue').length})
                            </button>
                          </div>
                          
                          {/* Print All to PDF Button - Only show when on Approved tab */}
                          {assetStatusFilter === 'approved' && jobAssets.filter(asset => asset.status === 'approved' && asset.file_url?.startsWith('report:')).length > 0 && (
                            <div className="mt-4">
                              <Button 
                                onClick={handlePrintAllApprovedReports} 
                                disabled={isPrinting}
                                className="w-full bg-gray-600 hover:bg-gray-700 text-white"
                              >
                                {isPrinting ? (
                                  <div className="flex items-center justify-center space-x-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    <span>Generating PDFs... {Math.round(printProgress)}%</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center space-x-2">
                                    <FileText className="h-4 w-4" />
                                    <span>Generate All PDFs</span>
                                  </div>
                                )}
                              </Button>
                              {isPrinting && printStatus && (
                                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                                    <div 
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                      style={{ width: `${printProgress}%` }}
                                    ></div>
                                  </div>
                                  <p className="text-center">{printStatus}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {jobAssets.length === 0 ? (
                          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                            <p>No assets have been linked to this job yet.</p>
                          </div>
                        ) : filteredJobAssets.length === 0 ? (
                          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                            <p>No matching assets found</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {(() => {
                              const getFolder = (asset: Asset): string => {
                                const name = asset.name || '';
                                const numberMatch = name.match(/^(\d+)\s*[-–]?\s*/);
                                if (/import/i.test(name) || /import/i.test(asset.file_url || '')) return 'Imported';
                                if (numberMatch) return numberMatch[1];
                                return 'Other';
                              };

                              const groups: Record<string, Asset[]> = {};
                              filteredJobAssets.forEach((asset) => {
                                const key = getFolder(asset);
                                if (!groups[key]) groups[key] = [];
                                groups[key].push(asset);
                              });

                              const orderKeys = Object.keys(groups).sort((a, b) => {
                                if (a === 'Imported') return -1;
                                if (b === 'Imported') return 1;
                                if (a === 'Other' && b !== 'Other') return 1;
                                if (b === 'Other' && a !== 'Other') return -1;
                                const na = parseInt(a, 10);
                                const nb = parseInt(b, 10);
                                const aNum = isNaN(na) ? Number.MAX_SAFE_INTEGER : na;
                                const bNum = isNaN(nb) ? Number.MAX_SAFE_INTEGER : nb;
                                return aNum - bNum;
                              });

                              return (
                                <>
                                  {orderKeys.map((folderKey) => (
                                    <details key={folderKey} className="group border rounded-md overflow-hidden">
                                      <summary className="cursor-pointer select-none bg-gray-50 dark:bg-dark-150 px-3 py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-gray-800 dark:text-white">
                                            {folderKey === 'Imported' ? 'Imported' : folderKey === 'Other' ? 'Other' : `${folderKey}`}
                                          </span>
                                          <span className="text-xs text-gray-500">({groups[folderKey].length})</span>
                                        </div>
                                        <svg className="w-4 h-4 text-gray-500 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </summary>
                                      <div className="bg-white dark:bg-dark-100">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Asset Name</TableHead>
                                              <TableHead>Status</TableHead>
                                              <TableHead>Date Added</TableHead>
                                              <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {groups[folderKey]
                                              .slice()
                                              .sort((a, b) => {
                                                const numA = parseInt(a.name.match(/^(\d+)/)?.[1] || '0', 10);
                                                const numB = parseInt(b.name.match(/^(\d+)/)?.[1] || '0', 10);
                                                if (numA !== numB) return numA - numB;
                                                return a.name.localeCompare(b.name);
                                              })
                                              .map((asset) => (
                                                <TableRow key={asset.id}>
                                                  <TableCell className="font-medium">{asset.id === 'low-voltage-cable-test-12sets' ? '3-Low Voltage Cable Test ATS' : asset.name}</TableCell>
                                                  <TableCell>
                                                    {asset.status === 'approved' || asset.status === 'issue' ? (
                                                      <span className={`px-2 py-1 rounded text-sm font-medium ${
                                                        asset.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                      }`}>
                                                        {asset.status === 'approved' ? 'Approved' : 'Issue'}
                                                      </span>
                                                    ) : (
                                                      <select
                                                        value={asset.status || 'in_progress'}
                                                        onChange={(e) => handleStatusUpdate(asset.id, e.target.value as Asset['status'])}
                                                        className={`px-2 py-1 rounded text-sm font-medium border-0 focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                                                          asset.status === 'ready_for_review' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                                          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                        }`}
                                                      >
                                                        <option value="in_progress">In Progress</option>
                                                        <option value="ready_for_review">Ready for Review</option>
                                                      </select>
                                                    )}
                                                  </TableCell>
                                                  <TableCell>
                                                    {format(new Date(asset.created_at), 'MMM d, yyyy')}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    <div className="flex items-center justify-end space-x-2">
                                                      {asset.file_url.startsWith('report:') ? (
                                                        <Link 
                                                          to={getReportEditPath(asset)}
                                                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                        >
                                                          Open Report
                                                        </Link>
                                                      ) : (
                                                        <a 
                                                          href={asset.file_url} 
                                                          target="_blank" 
                                                          rel="noopener noreferrer"
                                                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                        >
                                                          View
                                                        </a>
                                                      )}
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-0 h-auto"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setAssetToDelete(asset);
                                                          setShowDeleteConfirm(true);
                                                        }}
                                                      >
                                                        <Trash2 className="h-5 w-5 min-w-[20px] flex-shrink-0" />
                                                      </Button>
                                                    </div>
                                                  </TableCell>
                                                </TableRow>
                                              ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </details>
                                  ))}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
                
                {activeTab === 'reports' && job && (
                  user?.user_metadata?.role === 'Admin' ? (
                    <div className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Technical Reports</CardTitle>
                          <CardDescription>
                            Review and approve technical reports for this job
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ReportApprovalWorkflow 
                            division={job.division || undefined} 
                            jobId={job.id}
                            onUpdate={() => {
                              // Refresh assets and approved counts when approvals change
                              fetchJobAssets();
                            }}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Technical Reports</CardTitle>
                          <CardDescription>Report approval requires Admin role.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-sm text-yellow-800 dark:text-yellow-200">
                            You do not have permission to access the report approval view. Please contact an administrator if you believe this is an error.
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )
                )}
                
                {activeTab === 'surveys' && job && (
                  <JobSurveys 
                    jobId={job.id} 
                    customerId={job.customer_id} 
                    contacts={contacts}
                  />
                )}

                {activeTab === 'tracking' && job && (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>Project Tracker</CardTitle>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedReportForTracker}
                              onChange={(e) => setSelectedReportForTracker(e.target.value)}
                              className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white w-72"
                            >
                              <option value="">Select report to track...</option>
                              {defaultAssets.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                            <Input
                              type="number"
                              placeholder="Target"
                              value={newItemTarget}
                              onChange={(e) => setNewItemTarget(parseInt(e.target.value || '1', 10))}
                              className="w-24"
                            />
                            <Button onClick={addItem} disabled={!selectedReportForTracker}>Add</Button>
                            <Button onClick={handleSaveTrackingPlan} disabled={isSavingTracking}>
                              {isSavingTracking ? 'Saving...' : 'Save'}
                            </Button>
                          </div>
                        </div>
                        <CardDescription>
                          Enter a simple list of items with target quantities. Update completed counts manually.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {trackingItems.length === 0 ? (
                          <div className="text-sm text-gray-600 dark:text-gray-400">No tracking items yet. Add an item above.</div>
                        ) : (
                          <div className="space-y-4">
                            {trackingItems.map(item => {
                              const percent = item.target > 0 ? Math.min(100, Math.round((item.completed / item.target) * 100)) : 0;
                              return (
                                <div key={item.id} className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="font-medium text-gray-900 dark:text-white break-all">{item.name}</div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-600 dark:text-gray-400">Target</span>
                                      <Input
                                        type="number"
                                        value={item.target}
                                        onChange={(e) => updateItemTarget(item.id, parseInt(e.target.value || '0', 10))}
                                        className="w-24"
                                      />
                                      <Button variant="ghost" className="text-red-600" onClick={() => removeItem(item.id)}>Remove</Button>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Completed</span>
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" size="sm" onClick={() => incCompleted(item.id, -1)}>-</Button>
                                      <Input
                                        type="number"
                                        value={item.completed}
                                        onChange={(e) => updateItemCompleted(item.id, parseInt(e.target.value || '0', 10))}
                                        className="w-24"
                                      />
                                      <Button variant="outline" size="sm" onClick={() => incCompleted(item.id, 1)}>+</Button>
                                      <span className="text-sm text-gray-700 dark:text-gray-300">/ {item.target} ({percent}%)</span>
                                    </div>
                                  </div>
                                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                      className={`${percent >= 100 ? 'bg-green-600' : 'bg-blue-600'} h-full`}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
      
      {/* Upload file dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a document to associate with this job.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="document-name" className="text-sm font-medium">Document Name</label>
              <Input
                id="document-name"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                placeholder="Technical Documentation"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="document-file" className="text-sm font-medium">Select File</label>
              <Input
                id="document-file"
                type="file"
                onChange={handleFileChange}
              />
              {selectedFile && (
                <p className="text-xs text-gray-500">
                  {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                </p>
              )}
            </div>
            
            {isUploading && (
              <div className="space-y-2">
                <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 rounded-full" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-center">{uploadProgress}% Uploaded</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadDialog(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleFileUpload}
              disabled={isUploading || !selectedFile || !newAssetName.trim()}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this {assetToDelete?.file_url.startsWith('report:') ? 'report' : 'document'} from the job?
            </DialogDescription>
          </DialogHeader>
          
          {assetToDelete && (
            <div className="py-4">
              <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <FileText className="h-5 w-5 min-w-[20px] flex-shrink-0 text-gray-500 mr-2" />
                <span className="font-medium">{assetToDelete.name}</span>
              </div>
              
              {assetToDelete.file_url.startsWith('report:') ? (
                <p className="mt-2 text-sm text-gray-500">
                  This will only remove the link between the report and this job. The report will still be accessible from its direct URL.
                </p>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  This will permanently delete this document from the system.
                </p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setAssetToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAsset}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract Upload Dialog */}
      <Dialog open={showContractUpload} onOpenChange={setShowContractUpload}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Contract</DialogTitle>
            <DialogDescription>
              Upload a contract or agreement for this job.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="contract-name" className="text-sm font-medium">Contract Name</label>
              <Input
                id="contract-name"
                value={contractForm.name}
                onChange={(e) => setContractForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Main Service Contract"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contract-type" className="text-sm font-medium">Contract Type</label>
              <select
                id="contract-type"
                value={contractForm.type}
                onChange={(e) => setContractForm(prev => ({ ...prev, type: e.target.value as Contract['type'] }))}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="main">Main Contract</option>
                <option value="subcontract">Subcontract</option>
                <option value="amendment">Amendment</option>
                <option value="change_order">Change Order</option>
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="contract-value" className="text-sm font-medium">Contract Value ($)</label>
                <Input
                  id="contract-value"
                  type="number"
                  value={contractForm.value}
                  onChange={(e) => setContractForm(prev => ({ ...prev, value: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="contract-start" className="text-sm font-medium">Start Date</label>
                <Input
                  id="contract-start"
                  type="date"
                  value={contractForm.start_date}
                  onChange={(e) => setContractForm(prev => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contract-end" className="text-sm font-medium">End Date</label>
              <Input
                id="contract-end"
                type="date"
                value={contractForm.end_date}
                onChange={(e) => setContractForm(prev => ({ ...prev, end_date: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contract-description" className="text-sm font-medium">Description</label>
              <textarea
                id="contract-description"
                value={contractForm.description}
                onChange={(e) => setContractForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the contract..."
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white resize-none"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contract-file" className="text-sm font-medium">Contract File</label>
              <Input
                id="contract-file"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setContractFile(e.target.files?.[0] || null)}
              />
              {contractFile && (
                <p className="text-xs text-gray-500">
                  {contractFile.name} ({Math.round(contractFile.size / 1024)} KB)
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowContractUpload(false)}
              disabled={isContractUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleContractUpload}
              disabled={isContractUploading || !contractFile || !contractForm.name.trim()}
            >
              {isContractUploading ? 'Uploading...' : 'Upload Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing Upload Dialog */}
      <Dialog open={showDrawingUpload} onOpenChange={setShowDrawingUpload}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload One-Line Drawing</DialogTitle>
            <DialogDescription>
              Upload a one-line electrical drawing for this job.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="drawing-name" className="text-sm font-medium">Drawing Name</label>
              <Input
                id="drawing-name"
                value={drawingForm.name}
                onChange={(e) => setDrawingForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Main Electrical One-Line"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="drawing-description" className="text-sm font-medium">Description</label>
              <textarea
                id="drawing-description"
                value={drawingForm.description}
                onChange={(e) => setDrawingForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the drawing..."
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white resize-none"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="drawing-file" className="text-sm font-medium">Drawing File</label>
              <Input
                id="drawing-file"
                type="file"
                accept=".pdf,.dwg,.png,.jpg,.jpeg,.svg"
                onChange={(e) => setDrawingFile(e.target.files?.[0] || null)}
              />
              {drawingFile && (
                <p className="text-xs text-gray-500">
                  {drawingFile.name} ({Math.round(drawingFile.size / 1024)} KB)
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDrawingUpload(false)}
              disabled={isDrawingUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDrawingUpload}
              disabled={isDrawingUploading || !drawingFile || !drawingForm.name.trim()}
            >
              {isDrawingUploading ? 'Uploading...' : 'Upload Drawing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing Viewer Dialog */}
      <Dialog open={showDrawingViewer} onOpenChange={setShowDrawingViewer}>
        <DialogContent className="sm:max-w-[90vw] sm:max-h-[90vh] max-w-none w-full h-full">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{selectedDrawing?.name}</DialogTitle>
                <DialogDescription>
                  Version {selectedDrawing?.version} • {selectedDrawing?.status.replace('_', ' ')}
                </DialogDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => selectedDrawing && window.open(selectedDrawing.file_url, '_blank')}
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (selectedDrawing) {
                      const link = document.createElement('a');
                      link.href = selectedDrawing.file_url;
                      link.download = selectedDrawing.name;
                      link.click();
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowDrawingViewer(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            {selectedDrawing && (
              <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                {selectedDrawing.file_url.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={selectedDrawing.file_url}
                    className="w-full h-full rounded-lg"
                    title={selectedDrawing.name}
                  />
                ) : (
                  <img
                    src={selectedDrawing.file_url}
                    alt={selectedDrawing.name}
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}