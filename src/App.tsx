import React, { createContext, useState, useContext, ReactNode, useEffect, useLayoutEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useParams, useNavigationType } from 'react-router-dom';
import CustomerList from './components/customers/CustomerList';
import ContactList from './components/customers/ContactList';
import JobList from './components/jobs/JobList';
import CustomerDetail from './components/customers/CustomerDetail';
import ContactDetail from './components/customers/ContactDetail';
import JobDetail from './components/jobs/JobDetail';
import GeneratedDocumentViewer from './components/jobs/GeneratedDocumentViewer';
import DeliverableViewer from './components/jobs/DeliverableViewer';
import Dashboard from './app/dashboard/page';
import PortalLanding from './app/portal/page';
import UnifiedJobsPage from './app/all-jobs/page';
import SalesDashboard from './app/sales-dashboard/page';
import MeetingsPage from './app/meetings/page';
import MyDataPage from './app/meetings/my-data/page';
import InsightsPage from './app/meetings/insights/page';
import DataPage from './app/meetings/data/page';
import RocksPage from './app/meetings/rocks/page';
import ToDosPage from './app/meetings/to-dos/page';
import IssuesPage from './app/meetings/issues/page';
import HeadlinesPage from './app/meetings/headlines/page';
import VisionPage from './app/meetings/vision/page';
import ResponsibilitiesPage from './app/meetings/responsibilities/page';

import Login from './components/auth/Login';
import JobDiagnostics from './components/jobs/JobDiagnostics';
import OpportunityList from './components/jobs/OpportunityList';
import OpportunityDetail from './components/jobs/OpportunityDetail';
import OpportunitiesCalendarView from './components/jobs/OpportunitiesCalendarView';
import { AuthProvider, RequireAuth } from './lib/AuthContext';
import { ThemeProvider } from './components/theme/theme-provider';
import { DemoModeProvider } from './lib/DemoModeContext';
import DebugTableCheck from './components/debug/debug-table';
import { Layout } from './components/ui/Layout';
import SalesLayout from './components/ui/SalesLayout';
import { MeetingsLayout } from './components/ui/MeetingsLayout';
import HrLayout from './components/ui/HrLayout';
import SwitchgearReport from './components/reports/SwitchgearReport';
import GroundingSystemMaster from './components/reports/GroundingSystemMaster';
import GroundingFallOfPotentialSlopeMethodTest from './components/reports/GroundingFallOfPotentialSlopeMethodTest';
import PanelboardReport from './components/reports/PanelboardReport';
import DryTypeTransformerReport from './components/reports/DryTypeTransformerReport';
import LargeDryTypeTransformerReport from '@/components/reports/LargeDryTypeTransformerReport';
import LiquidFilledTransformerReport from './components/reports/LiquidFilledTransformerReport';
import OilInspectionReport from './components/reports/OilInspectionReport';
import TwelveSetsLowVoltageCableTestForm from './components/reports/12setslowvoltagecables';
import TanDeltaChart from './components/reports/TanDeltaChart';
import TanDeltaChartMTS from './components/reports/TanDeltaChartMTS';
import MediumVoltageVLFReport from './components/reports/MediumVoltageVLFReport';
import MediumVoltageCableVLFTest from './components/reports/MediumVoltageCableVLFTest';
import ThreeLowVoltageCableMTSForm from './components/reports/3-LowVoltageCableMTS';
import ThreeLowVoltageCableATSForm from './components/reports/3-LowVoltageCableATS';
import MediumVoltageVLFMTSReport from './components/reports/MediumVoltageVLFMTSReport';
import ProfileSetup from './pages/ProfileSetup';
import TechnicianProfilesPage from './pages/TechnicianProfilesPage';
import CustomerCategoriesPage from './pages/CustomerCategoriesPage';
import ReportsPage from './app/[division]/reports/page';
import AdminDashboard from './app/admin-dashboard/page';
import FloatingMyMenu from './components/shortcuts/FloatingMyMenu';
import FloatingIssueReporter from './components/feedback/FloatingIssueReporter';
import SchedulingPage from './app/scheduling/page';
import FieldEquipmentPage from './app/[division]/field-equipment/page';
import GoalsPage from './app/(dashboard)/sales/goals/page';
import NewGoalPage from './app/(dashboard)/sales/goals/new/page';
import EditGoalPage from './app/(dashboard)/sales/goals/[id]/edit/page';
import GoalsDashboardPage from './app/(dashboard)/sales/goals/dashboard/page';
import GoalManagementPage from './app/(dashboard)/sales/goals/management/page';
import EngineeringPage from './app/engineering/page';
import EngineeringDashboard from './app/engineering/dashboard/page';
import { EncryptionSettings } from './components/admin/EncryptionSettings';
import FeaturesFixesPage from './app/features-fixes/page';
import FormBuilder from './components/customForms/FormBuilder';
import CustomFormFiller from './components/customForms/CustomFormFiller';
import CustomFormTemplates from './pages/CustomFormTemplates';
import CustomFormPreview from './pages/CustomFormPreview';
import EULA from './pages/EULA';
import Privacy from './pages/Privacy';
import EstimatingPresetsPage from './pages/EstimatingPresetsPage';
import { HrDashboard } from './pages/HrDashboard';
import { JobRequisitions } from './pages/hr/recruiting/JobRequisitions';
import { RequisitionApprovals } from './pages/hr/recruiting/RequisitionApprovals';
import { CareerPage } from './pages/hr/recruiting/CareerPage';
import { PublicCareerPage } from './pages/hr/recruiting/PublicCareerPage';
import { PublicOfferSigning } from './pages/hr/offers/PublicOfferSigning';
import { CandidateTracking } from './pages/hr/recruiting/CandidateTracking';
import { InterviewScheduling } from './pages/hr/recruiting/InterviewScheduling';
import { ResumeParsing } from './pages/hr/recruiting/ResumeParsing';
import { CandidateCommunication } from './pages/hr/recruiting/CandidateCommunication';
import { OfferLetters } from './pages/hr/offers/OfferLetters';
import { OfferApprovals } from './pages/hr/offers/OfferApprovals';
import { ESignatures } from './pages/hr/offers/ESignatures';
import { CompPositionDetails } from './pages/hr/offers/CompPositionDetails';
import { NewHirePackets } from './pages/hr/onboarding/NewHirePackets';
import { OnboardingTracking } from './pages/hr/onboarding/OnboardingTracking';
import { ESignForms } from './pages/hr/onboarding/ESignForms';
import { Checklists } from './pages/hr/onboarding/Checklists';
import { WelcomeEmails } from './pages/hr/onboarding/WelcomeEmails';
import { ITEquipmentTasks } from './pages/hr/onboarding/ITEquipmentTasks';
import { ITOnboarding } from './pages/hr/onboarding/ITOnboarding';
import { OfficeAdminTasks } from './pages/hr/onboarding/OfficeAdminTasks';
import { OfficeAdminOnboarding } from './pages/hr/onboarding/OfficeAdminOnboarding';
import { HRTasks } from './pages/hr/onboarding/HRTasks';
import { HROnboarding } from './pages/hr/onboarding/HROnboarding';
import { MyOnboarding } from './pages/hr/onboarding/MyOnboarding';
import { SignOnboardingForm } from './pages/hr/onboarding/SignOnboardingForm';
import { DocumentStorage } from './pages/hr/employee-files/DocumentStorage';
import { VersionTracking } from './pages/hr/employee-files/VersionTracking';
import { EmployeeFiles } from './pages/hr/employee-files/EmployeeFiles';
import { EmployeeProfiles } from './pages/hr/data/EmployeeProfiles';
import { JobTitleHistory } from './pages/hr/data/JobTitleHistory';
import { CompensationHistory } from './pages/hr/data/CompensationHistory';
import { OrgChart } from './pages/hr/data/OrgChart';
import { CallList } from './pages/hr/data/CallList';
import { DocumentAcknowledgment } from './pages/hr/compliance/DocumentAcknowledgment';
import { ESignRecordkeeping } from './pages/hr/compliance/ESignRecordkeeping';
import { EeoReporting } from './pages/hr/compliance/EeoReporting';
import { TerminationWorkflows } from './pages/hr/offboarding/TerminationWorkflows';
import { ExitSurveys } from './pages/hr/offboarding/ExitSurveys';
import { PublicExitSurveyTake } from './pages/hr/offboarding/PublicExitSurveyTake';
import { FinalDocs } from './pages/hr/offboarding/FinalDocs';
import { HrCustomReports } from './pages/hr/analytics/HrCustomReports';
import { EmployeePortal } from './pages/hr/self-service/EmployeePortal';
import { ManagerPortal } from './pages/hr/self-service/ManagerPortal';
import { TaskWorkflows } from './pages/hr/self-service/TaskWorkflows';
import { Announcements as HrAnnouncements } from './pages/hr/announcements/Announcements';

// Import Help Center components
import { HelpCenterDashboard, GuideBuilder, GuideViewer } from './components/helpCenter';

// MUI X Date Pickers setup
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

// Import Lab Portal components
import { EquipmentCalibration } from './components/lab/EquipmentCalibration';
import { TestingProcedures } from './components/lab/TestingProcedures';
import { CertificateGenerator } from './components/lab/CertificateGenerator';
import { QualityMetrics } from './components/lab/QualityMetrics';
import { LabDashboard } from './components/lab/LabDashboard';

// Import division-specific dashboards
import NorthAlabamaDashboard from './app/dashboards/NorthAlabamaDashboard';
import TennesseeDashboard from './app/dashboards/TennesseeDashboard';
import GeorgiaDashboard from './app/dashboards/GeorgiaDashboard';
import InternationalDashboard from './app/dashboards/InternationalDashboard';
import CalibrationDashboard from './app/dashboards/CalibrationDashboard';
import ScavengerDashboard from './app/dashboards/ScavengerDashboard';
import FieldTechDashboard from './app/dashboards/FieldTechDashboard';

// Import Equipment Management
import EquipmentPage from './app/[division]/equipment/page';
// Import Maintenance Management
import MaintenancePage from './app/[division]/maintenance/page';

// Add territory management imports
import TerritoryManagement from './components/sales/TerritoryManagement';

// Import Engineering components properly with the right casing
import { DesignApprovalWorkflow } from './components/engineering/DesignApprovalWorkflow';
import { TechnicalDocumentationLibrary } from './components/engineering/TechnicalDocumentationLibrary';
import { StandardsComplianceUpdates } from './components/engineering/StandardsComplianceUpdates';
import DrawingRepository from './components/engineering/DrawingRepository';

// Import Office Administration Portal component
import VendorPOs from './app/office/VendorPOs';
import Vendors from './app/office/Vendors';

// Import Resource Management component
import ResourceManagement from './components/resources/ResourceManagement';

// Import AuthCallback component
import AuthCallback from './components/auth/AuthCallback';

// Import QuickBooks components
import QuickBooksCallback from './components/quickbooks/QuickBooksCallback';

// Import the initializeRoles function
import { initializeRoles } from './services/roleService';

// Import supabase
import { supabase } from './lib/supabase';

// Import Low Voltage Switch Multi-Device Test component
import LowVoltageSwitchWithPrint from './components/reports/LowVoltageSwitchMultiDeviceTest';
// Import Low Voltage Switch Report component
import LowVoltageSwitchReport from './components/reports/LowVoltageSwitchReport';
// Import Metal Enclosed Busway Report component
import MetalEnclosedBuswayReport from './components/reports/MetalEnclosedBuswayReport';

// Import Medium Voltage Switch Oil Report component
import MediumVoltageSwitchOilReport from './components/reports/MediumVoltageSwitchOilReport';
import MediumVoltageSwitchSF6Report from './components/reports/MediumVoltageSwitchSF6Report';
import PotentialTransformerATSReport from './components/reports/PotentialTransformerATSReport';

// Import Low Voltage Circuit Breaker Electronic Trip Unit ATS Report component
import LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport from './components/reports/LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport';
import LowVoltageCircuitBreakerElectronicTripATSReport from './components/reports/LowVoltageCircuitBreakerElectronicTripATSReport';
import LowVoltageCircuitBreakerElectronicTripMTSReport from './components/reports/LowVoltageCircuitBreakerElectronicTripMTSReport';
import LowVoltageCircuitBreakerThermalMagneticATSReport from './components/reports/LowVoltageCircuitBreakerThermalMagneticATSReport';
import LowVoltageCircuitBreakerThermalMagneticMTSReport from './components/reports/LowVoltageCircuitBreakerThermalMagneticMTSReport';
import LVMoldedCaseCircuitBreakerATS25Report from './components/reports/LVMoldedCaseCircuitBreakerATS25Report';
import EmergencySystemsEngineGeneratorATS25Report from './components/reports/EmergencySystemsEngineGeneratorATS25Report';
import LowVoltageSwitchMaintMTSReport from './components/reports/6-LowVoltageSwitchMaintMTSReport';

// Import the new Small Breaker Panelboard report
import LowVoltagePanelboardSmallBreakerTestATSReport from './components/reports/LowVoltagePanelboardSmallBreakerTestATSReport';
// Import the new Medium Voltage Circuit Breaker report
import MediumVoltageCircuitBreakerReport from './components/reports/MediumVoltageCircuitBreakerReport';
// Import Medium Voltage Circuit Breaker MTS Report component
import MediumVoltageCircuitBreakerMTSReport from './components/reports/MediumVoltageCircuitBreakerMTSReport';

// Import the new Current Transformer Test ATS Report component
import CurrentTransformerTestATSReport from './components/reports/CurrentTransformerTestATSReport';

// Import Oil Analysis Report
import OilAnalysisReport from './components/reports/OilAnalysisReport';

// Import Cable Hi-Pot Test Report
import CableHiPotReport from './components/reports/CableHiPotReport';

// Import the new 12-Current Transformer Test ATS Report
const New12CurrentTransformerTestATSReport = lazy(() => import('@/components/reports/12-CurrentTransformerTestATSReport'));

// Import the new 12-Current Transformer Test MTS Report
const New12CurrentTransformerTestMTSReport = lazy(() => import('@/components/reports/12-CurrentTransformerTestMTSReport'));

// Import the new 13-Voltage Potential Transformer Test MTS Report
import VoltagePotentialTransformerTestMTSReport from './components/reports/13-VoltagePotentialTransformerTestMTSReport';

// Import Relay Test Report
import RelayTestReport from './components/reports/RelayTestReport';

// Import Automatic Transfer Switch ATS Report
import AutomaticTransferSwitchATSReport from '@/components/reports/AutomaticTransferSwitchATSReport';

// Import Applied Voltage Test ATS Report
import AppliedVoltageTestATSReport from '@/components/reports/AppliedVoltageTestATSReport';
import SwitchgearSwitchboardAssembliesATS25Report from '@/components/reports/SwitchgearSwitchboardAssembliesATS25Report';
import PanelboardAssembliesATS25Report from '@/components/reports/PanelboardAssembliesATS25Report';
import SmallLowVoltageDryTypeTransformerATS25Report from '@/components/reports/SmallLowVoltageDryTypeTransformerATS25Report';
import LiquidFilledXfmrATS25Report from '@/components/reports/LiquidFilledXfmrATS25Report';

// Import Standard Report Template (misc/other) - removed as we are not using miscellaneous now

// Import Switchgear Panelboard MTS Report
import SwitchgearPanelboardMTSReport from './components/reports/SwitchgearPanelboardMTSReport';
import JobHazardAnalysisForm from './components/reports/JobHazardAnalysisForm';

// Import the new Large Dry Type Transformer MTS Report
import LargeDryTypeTransformerMTSReport from './components/reports/LargeDryTypeTransformerMTSReport';

// Import the new Large Dry Type Transformer MTS Report
import LargeDryTypeXfmrMTSReport from './components/reports/LargeDryTypeXfmrMTSReport';

// Import the new LiquidXfmrVisualMTSReport component
const LiquidXfmrVisualMTSReport = lazy(() => import('@/components/reports/LiquidXfmrVisualMTSReport'));

// Import the new Two Small Dry Type Transformer ATS Report component
const TwoSmallDryTyperXfmrATSReport = lazy(() => import('@/components/reports/TwoSmallDryTyperXfmrATSReport'));

// Import the new Two Small Dry Type Transformer MTS Report component
const TwoSmallDryTyperXfmrMTSReport = lazy(() => import('@/components/reports/TwoSmallDryTyperXfmrMTSReport'));

// Import the new Tan Delta Test MTS Form report
import TanDeltaTestMTSForm from './components/reports/TanDeltaTestMTSForm';

// Import the new 23-Medium Voltage Motor Starter MTS Report
import MediumVoltageMotorStarterMTSReport from './components/reports/23-MediumVoltageMotorStarterMTSReport';
import MediumVoltageSwitchMTSReport from './components/reports/23-MediumVoltageSwitchMTSReport';

// Import GFI Trip Test Report
import GFITripTestReport from './components/reports/GFITripTestReport';

// Import Keyboard Navigation Test component
import { KeyboardNavigationTest } from './components/test/KeyboardNavigationTest';
import { BackToJobButtonTest } from './components/test/BackToJobButtonTest';

// --- Define Division Context --- Start
interface DivisionContextType {
  division: string | null;
  setDivision: (division: string | null) => void;
}

const DivisionContext = createContext<DivisionContextType | undefined>(undefined);

export const DivisionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [division, setDivisionState] = useState<string | null>(() => {
    const savedDivision = localStorage.getItem('selectedDivision');
    console.log('Initial division from localStorage:', savedDivision);
    return savedDivision;
  });

  const setDivision = (newDivision: string | null) => {
    console.log('Setting division to:', newDivision);
    setDivisionState(newDivision);
    if (newDivision) {
      localStorage.setItem('selectedDivision', newDivision);
    } else {
      localStorage.removeItem('selectedDivision');
    }
  };

  useEffect(() => {
    console.log('Current division state:', division);
  }, [division]);

  return (
    <DivisionContext.Provider value={{ division, setDivision }}>
      {children}
    </DivisionContext.Provider>
  );
};

export const useDivision = () => {
  const context = useContext(DivisionContext);
  if (context === undefined) {
    throw new Error('useDivision must be used within a DivisionProvider');
  }
  return context;
};
// --- Define Division Context --- End

// Add a ScrollToTop component that will reset scroll position on route changes
function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  
  useLayoutEffect(() => {
    // Scroll to top on navigation except when user uses browser back/forward
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);
  
  return null;
}

// Redirect /armadillo/dashboard to external Armadillo Base
function ArmadilloRedirect() {
  useEffect(() => {
    window.location.href = 'https://armadillobase.vercel.app';
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-600 dark:text-gray-400">
      Redirecting to Armadillo Base…
    </div>
  );
}

// Add a new component for database schema debugging
const DatabaseDebug: React.FC = () => {
  const [schemaInfo, setSchemaInfo] = useState<any>({});
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInfo() {
      try {
        setLoading(true);
        
        // Check schema information
        const { data: schemas, error: schemaError } = await supabase
          .rpc('get_schemas');
          
        if (schemaError) throw schemaError;
        
        // Try to get customers from different schemas
        const [publicCustomers, commonCustomers] = await Promise.all([
          supabase.from('customers').select('*'),
          supabase.schema('common').from('customers').select('*')
        ]);
        
        setSchemaInfo({
          schemas,
          publicCustomerError: publicCustomers.error?.message || null,
          commonCustomerError: commonCustomers.error?.message || null,
          publicCustomerCount: publicCustomers.data?.length || 0,
          commonCustomerCount: commonCustomers.data?.length || 0
        });
        
        // Set customers from common schema (which should be correct)
        setCustomers(commonCustomers.data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    loadInfo();
  }, []);
  
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Database Schema Debug</h1>
      
      {loading ? (
        <p>Loading database information...</p>
      ) : error ? (
        <div className="p-4 bg-red-100 text-red-700 rounded">
          <h2 className="font-semibold">Error:</h2>
          <p>{error}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-2">Schema Information</h2>
            <pre className="p-4 bg-gray-100 rounded overflow-auto max-h-40">
              {JSON.stringify(schemaInfo, null, 2)}
            </pre>
          </div>
          
          <div>
            <h2 className="text-lg font-semibold mb-2">Customers ({customers.length})</h2>
            {customers.length === 0 ? (
              <p className="italic text-gray-500">No customers found in database.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {customers.map(customer => (
                      <tr key={customer.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.company_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(customer.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  useEffect(() => {
    // Initialize custom roles
    initializeRoles().catch(err => {
      console.error('Failed to initialize roles:', err);
    });
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DemoModeProvider>
            <DivisionProvider>
                <Router>
                <ScrollToTop />
                <Routes>
                  {/* === Public Legal Pages (no auth required) === */}
                  <Route path="/eula" element={<EULA />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/careers" element={<PublicCareerPage />} />
                  <Route path="/sign-offer/:token" element={<PublicOfferSigning />} />
                  <Route path="/exit-survey/:token" element={<PublicExitSurveyTake />} />
                  
                  {/* === Core Routes === */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/auth/quickbooks/callback" element={<QuickBooksCallback />} />
                  <Route path="/" element={<Navigate to="/portal" replace />} />
                  <Route path="/portal" element={<RequireAuth><PortalLanding /></RequireAuth>} />
                  <Route path="/admin-dashboard" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
                  <Route path="/admin/encryption" element={<RequireAuth><Layout><EncryptionSettings /></Layout></RequireAuth>} />
                  <Route path="/profile-setup" element={<RequireAuth><ProfileSetup /></RequireAuth>} />
                  <Route path="/debug" element={<RequireAuth><Layout><DebugTableCheck /></Layout></RequireAuth>} />
                  <Route path="/keyboard-test" element={<RequireAuth><Layout><KeyboardNavigationTest /></Layout></RequireAuth>} />
                  <Route path="/back-to-job-test" element={<RequireAuth><Layout><BackToJobButtonTest /></Layout></RequireAuth>} />
                  {/* === Features & Fixes Portal (independent window, no Layout) === */}
                  <Route path="/features-fixes" element={<RequireAuth><FeaturesFixesPage /></RequireAuth>} />

                  {/* === Custom Forms === */}
                  <Route path="/custom-forms/templates" element={<RequireAuth><Layout><CustomFormTemplates /></Layout></RequireAuth>} />
                  <Route path="/custom-forms/preview/:templateId" element={<RequireAuth><CustomFormPreview /></RequireAuth>} />
                  <Route path="/custom-forms/builder" element={<RequireAuth><FormBuilder /></RequireAuth>} />
                  <Route path="/custom-forms/builder/:templateId" element={<RequireAuth><FormBuilder /></RequireAuth>} />
                  <Route path="/jobs/:jobId/custom-form/:templateId/new" element={<RequireAuth><CustomFormFiller /></RequireAuth>} />
                  <Route path="/jobs/:jobId/custom-form/:templateId/:instanceId" element={<RequireAuth><CustomFormFiller /></RequireAuth>} />

                  {/* === Help Center Routes === */}
                  <Route path="/help-center" element={<RequireAuth><HelpCenterDashboard /></RequireAuth>} />
                  <Route path="/help-center/builder" element={<RequireAuth><GuideBuilder /></RequireAuth>} />
                  <Route path="/help-center/builder/:guideId" element={<RequireAuth><GuideBuilder /></RequireAuth>} />
                  <Route path="/help-center/guide/:guideId" element={<RequireAuth><GuideViewer /></RequireAuth>} />

                  {/* === Office Administration Portal Routes === */}
                  <Route path="/office" element={<RequireAuth><Layout><VendorPOs /></Layout></RequireAuth>} />
                  <Route path="/office/vendors" element={<RequireAuth><Layout><Vendors /></Layout></RequireAuth>} />

                  {/* === Lab Portal Routes === */}
                  <Route path="/lab" element={<RequireAuth><Layout><LabDashboard /></Layout></RequireAuth>} />
                  <Route path="/lab/equipment" element={<RequireAuth><Layout><EquipmentCalibration /></Layout></RequireAuth>} />
                  <Route path="/lab/procedures" element={<RequireAuth><Layout><TestingProcedures /></Layout></RequireAuth>} />
                  <Route path="/lab/certificates" element={<RequireAuth><Layout><CertificateGenerator /></Layout></RequireAuth>} />
                  <Route path="/lab/quality-metrics" element={<RequireAuth><Layout><QualityMetrics /></Layout></RequireAuth>} />
                  
                  {/* === Engineering Portal Routes === */}
                  <Route path="/engineering" element={<RequireAuth><Layout><EngineeringDashboard /></Layout></RequireAuth>} />
                  <Route path="/engineering/dashboard" element={<RequireAuth><Layout><EngineeringDashboard /></Layout></RequireAuth>} />
                  {/* Engineering jobs use the generic /:division/jobs route below */}
                  <Route path="/engineering/designs" element={<RequireAuth><Layout><DesignApprovalWorkflow /></Layout></RequireAuth>} />
                  <Route path="/engineering/documentation" element={<RequireAuth><Layout><TechnicalDocumentationLibrary /></Layout></RequireAuth>} />
                  <Route path="/engineering/standards" element={<RequireAuth><Layout><StandardsComplianceUpdates /></Layout></RequireAuth>} />
                  <Route path="/engineering/drawings" element={<RequireAuth><Layout><DrawingRepository /></Layout></RequireAuth>} />
                  
                  {/* === Sales Dashboard Routes === */}
                  <Route path="/sales-dashboard" element={<RequireAuth><SalesLayout><SalesDashboard /></SalesLayout></RequireAuth>} />
                  <Route path="/sales-dashboard/customers" element={<RequireAuth><SalesLayout><CustomerList /></SalesLayout></RequireAuth>} />
                  <Route path="/sales-dashboard/customers/:id" element={<RequireAuth><SalesLayout><CustomerDetail /></SalesLayout></RequireAuth>} />
                  <Route path="/sales-dashboard/contacts" element={<RequireAuth><SalesLayout><ContactList /></SalesLayout></RequireAuth>} />
                  <Route path="/sales-dashboard/contacts/:id" element={<RequireAuth><SalesLayout><ContactDetail /></SalesLayout></RequireAuth>} />
                  <Route path="/sales-dashboard/opportunities" element={<RequireAuth><SalesLayout><OpportunityList /></SalesLayout></RequireAuth>} />
                  <Route path="/sales-dashboard/opportunities/calendar" element={<RequireAuth><SalesLayout><OpportunitiesCalendarView /></SalesLayout></RequireAuth>} />
                  <Route path="/sales-dashboard/opportunities/:id" element={<RequireAuth><SalesLayout><OpportunityDetail /></SalesLayout></RequireAuth>} />

                  <Route path="/sales-dashboard/customer-categories" element={<RequireAuth><SalesLayout><CustomerCategoriesPage /></SalesLayout></RequireAuth>} />
                  
                  {/* === Territory Management Routes === */}
                  <Route path="/territories" element={<RequireAuth><SalesLayout><TerritoryManagement /></SalesLayout></RequireAuth>} />
                  <Route path="/territories/:id/manage-sales-reps" element={<RequireAuth><SalesLayout><TerritoryManagement /></SalesLayout></RequireAuth>} />
                  <Route path="/territories/:id/performance" element={<RequireAuth><SalesLayout><TerritoryManagement /></SalesLayout></RequireAuth>} />
                  
                  {/* === Sales Goals Routes === */}
                  <Route path="/sales/goals" element={<RequireAuth><SalesLayout><GoalsPage /></SalesLayout></RequireAuth>} />
                  <Route path="/sales/goals/dashboard" element={<RequireAuth><SalesLayout><GoalsDashboardPage /></SalesLayout></RequireAuth>} />
                  <Route path="/sales/goals/new" element={<RequireAuth><SalesLayout><NewGoalPage /></SalesLayout></RequireAuth>} />
                  <Route path="/sales/goals/:id/edit" element={<RequireAuth><SalesLayout><EditGoalPage /></SalesLayout></RequireAuth>} />
                  <Route path="/sales/goals/management" element={<RequireAuth><SalesLayout><GoalManagementPage /></SalesLayout></RequireAuth>} />
                  
                  {/* === Estimating Presets Route === */}
                  <Route path="/sales/estimating-presets" element={<RequireAuth><SalesLayout><EstimatingPresetsPage /></SalesLayout></RequireAuth>} />

                  {/* === HR Portal Routes === */}
                  <Route path="/hr" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/dashboard" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  
                  {/* HR Announcements Route */}
                  <Route path="/hr/announcements" element={<RequireAuth><HrLayout><HrAnnouncements /></HrLayout></RequireAuth>} />
                  
                  {/* HR Recruiting Routes */}
                  <Route path="/hr/recruiting/job-requisitions" element={<RequireAuth><HrLayout><JobRequisitions /></HrLayout></RequireAuth>} />
                  <Route path="/hr/recruiting/requisition-approvals" element={<RequireAuth><HrLayout><RequisitionApprovals /></HrLayout></RequireAuth>} />
                  <Route path="/hr/recruiting/career-page" element={<RequireAuth><HrLayout><CareerPage /></HrLayout></RequireAuth>} />
                  <Route path="/hr/recruiting/candidate-tracking" element={<RequireAuth><HrLayout><CandidateTracking /></HrLayout></RequireAuth>} />
                  <Route path="/hr/recruiting/interview-scheduling" element={<RequireAuth><HrLayout><InterviewScheduling /></HrLayout></RequireAuth>} />
                  <Route path="/hr/recruiting/resume-parsing" element={<RequireAuth><HrLayout><ResumeParsing /></HrLayout></RequireAuth>} />
                  <Route path="/hr/recruiting/candidate-communication" element={<RequireAuth><HrLayout><CandidateCommunication /></HrLayout></RequireAuth>} />
                  
                  {/* HR Offers Routes */}
                  <Route path="/hr/offers/offer-letters" element={<RequireAuth><HrLayout><OfferLetters /></HrLayout></RequireAuth>} />
                  <Route path="/hr/offers/offer-approvals" element={<RequireAuth><HrLayout><OfferApprovals /></HrLayout></RequireAuth>} />
                  <Route path="/hr/offers/e-signatures" element={<RequireAuth><HrLayout><ESignatures /></HrLayout></RequireAuth>} />
                  <Route path="/hr/offers/comp-position-details" element={<RequireAuth><HrLayout><CompPositionDetails /></HrLayout></RequireAuth>} />
                  
                  {/* HR Onboarding Routes */}
                  <Route path="/hr/onboarding/your-onboarding" element={<RequireAuth><HrLayout><MyOnboarding /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/sign-form/:formId" element={<RequireAuth><HrLayout><SignOnboardingForm /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/tracking" element={<RequireAuth><HrLayout><OnboardingTracking /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/new-hire-packets" element={<RequireAuth><HrLayout><NewHirePackets /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/e-sign-forms" element={<RequireAuth><HrLayout><ESignForms /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/checklists" element={<RequireAuth><HrLayout><Checklists /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/welcome-emails" element={<RequireAuth><HrLayout><WelcomeEmails /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/it-equipment-tasks" element={<RequireAuth><HrLayout><ITEquipmentTasks /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/it-onboarding" element={<RequireAuth><HrLayout><ITOnboarding /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/office-admin-tasks" element={<RequireAuth><HrLayout><OfficeAdminTasks /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/office-admin-onboarding" element={<RequireAuth><HrLayout><OfficeAdminOnboarding /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/hr-tasks" element={<RequireAuth><HrLayout><HRTasks /></HrLayout></RequireAuth>} />
                  <Route path="/hr/onboarding/hr-onboarding" element={<RequireAuth><HrLayout><HROnboarding /></HrLayout></RequireAuth>} />
                  
                  {/* HR Employee Files Routes */}
                  <Route path="/hr/employee-files" element={<RequireAuth><HrLayout><EmployeeFiles /></HrLayout></RequireAuth>} />
                  <Route path="/hr/employee-files/document-storage" element={<RequireAuth><HrLayout><DocumentStorage /></HrLayout></RequireAuth>} />
                  <Route path="/hr/employee-files/version-tracking" element={<RequireAuth><HrLayout><VersionTracking /></HrLayout></RequireAuth>} />
                  
                  {/* HR Data Routes */}
                  <Route path="/hr/data/employee-profiles" element={<RequireAuth><HrLayout><EmployeeProfiles /></HrLayout></RequireAuth>} />
                  <Route path="/hr/data/job-title-history" element={<RequireAuth><HrLayout><JobTitleHistory /></HrLayout></RequireAuth>} />
                  <Route path="/hr/data/compensation-history" element={<RequireAuth><HrLayout><CompensationHistory /></HrLayout></RequireAuth>} />
                  <Route path="/hr/data/org-chart" element={<RequireAuth><HrLayout><OrgChart /></HrLayout></RequireAuth>} />
                  <Route path="/hr/data/call-list" element={<RequireAuth><HrLayout><CallList /></HrLayout></RequireAuth>} />
                  <Route path="/hr/data/reporting" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/data/custom-tabs" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  
                  {/* HR Time & Attendance Routes */}
                  <Route path="/hr/time-attendance/pto-leave" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/time-attendance/accrual-policies" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/time-attendance/timesheets" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  
                  {/* HR Performance Routes */}
                  <Route path="/hr/performance/review-cycles" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/performance/goals" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/performance/feedback-tools" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  
                  {/* HR Compliance Routes */}
                  <Route path="/hr/compliance/document-acknowledgment" element={<RequireAuth><HrLayout><DocumentAcknowledgment /></HrLayout></RequireAuth>} />
                  <Route path="/hr/compliance/e-sign-recordkeeping" element={<RequireAuth><HrLayout><ESignRecordkeeping /></HrLayout></RequireAuth>} />
                  <Route path="/hr/compliance/eeo-reporting" element={<RequireAuth><HrLayout><EeoReporting /></HrLayout></RequireAuth>} />
                  
                  {/* HR Offboarding Routes */}
                  <Route path="/hr/offboarding/termination-workflows" element={<RequireAuth><HrLayout><TerminationWorkflows /></HrLayout></RequireAuth>} />
                  <Route path="/hr/offboarding/exit-surveys" element={<RequireAuth><HrLayout><ExitSurveys /></HrLayout></RequireAuth>} />
                  <Route path="/hr/offboarding/final-docs" element={<RequireAuth><HrLayout><FinalDocs /></HrLayout></RequireAuth>} />
                  
                  {/* HR Integrations Routes */}
                  <Route path="/hr/integrations/payroll" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/integrations/background-checks" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/integrations/benefits-time-ats" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  
                  {/* HR Analytics Routes */}
                  <Route path="/hr/analytics/dashboards" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  <Route path="/hr/analytics/custom-reports" element={<RequireAuth><HrLayout><HrCustomReports /></HrLayout></RequireAuth>} />
                  <Route path="/hr/analytics/export-tools" element={<RequireAuth><HrLayout><HrDashboard /></HrLayout></RequireAuth>} />
                  
                  {/* HR Self-Service Routes */}
                  <Route path="/hr/self-service/employee-portal" element={<RequireAuth><HrLayout><EmployeePortal /></HrLayout></RequireAuth>} />
                  <Route path="/hr/self-service/manager-portal" element={<RequireAuth><HrLayout><ManagerPortal /></HrLayout></RequireAuth>} />
                  <Route path="/hr/self-service/task-workflows" element={<RequireAuth><HrLayout><TaskWorkflows /></HrLayout></RequireAuth>} />

                  {/* === Meetings Portal Routes === */}
                  <Route path="/meetings" element={<RequireAuth><MeetingsLayout><MeetingsPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/my-data" element={<RequireAuth><MeetingsLayout><MyDataPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/insights" element={<RequireAuth><MeetingsLayout><InsightsPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/data" element={<RequireAuth><MeetingsLayout><DataPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/rocks" element={<RequireAuth><MeetingsLayout><RocksPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/to-dos" element={<RequireAuth><MeetingsLayout><ToDosPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/todos" element={<RequireAuth><MeetingsLayout><ToDosPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/issues" element={<RequireAuth><MeetingsLayout><IssuesPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/headlines" element={<RequireAuth><MeetingsLayout><HeadlinesPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/vision" element={<RequireAuth><MeetingsLayout><VisionPage /></MeetingsLayout></RequireAuth>} />
                  <Route path="/meetings/responsibilities" element={<RequireAuth><MeetingsLayout><ResponsibilitiesPage /></MeetingsLayout></RequireAuth>} />

                  {/* === Division-Specific Dashboard Routes === */}
                  {/* These specific routes should come before the generic /:division/dashboard route */}
                  <Route path="/field-tech" element={<RequireAuth><Layout><FieldTechDashboard /></Layout></RequireAuth>} />
                  <Route path="/field-tech/dashboard" element={<RequireAuth><Layout><FieldTechDashboard /></Layout></RequireAuth>} />
                  <Route path="/north_alabama/dashboard" element={<RequireAuth><Layout><NorthAlabamaDashboard /></Layout></RequireAuth>} />
                  <Route path="/tennessee/dashboard" element={<RequireAuth><Layout><TennesseeDashboard /></Layout></RequireAuth>} />
                  <Route path="/georgia/dashboard" element={<RequireAuth><Layout><GeorgiaDashboard /></Layout></RequireAuth>} />
                  <Route path="/engineering/dashboard" element={<RequireAuth><Layout><EngineeringDashboard /></Layout></RequireAuth>} />
                  <Route path="/calibration/dashboard" element={<RequireAuth><Layout><CalibrationDashboard /></Layout></RequireAuth>} />
                  <Route path="/armadillo/dashboard" element={<RequireAuth><ArmadilloRedirect /></RequireAuth>} />
                  <Route path="/scavenger/dashboard" element={<RequireAuth><Layout><ScavengerDashboard /></Layout></RequireAuth>} />
                  
                  {/* Generic dashboard as fallback */}
                  <Route path="/:division/dashboard" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
                  
                  {/* === Other Division-Specific Routes === */}
                  {/* Customers */}
                  <Route path="/:division/customers" element={<RequireAuth><Layout><CustomerList /></Layout></RequireAuth>} />
                  <Route path="/:division/customer-categories" element={<RequireAuth><Layout><CustomerCategoriesPage /></Layout></RequireAuth>} />
                  <Route path="/:division/customers/:id" element={<RequireAuth><Layout><CustomerDetail /></Layout></RequireAuth>} />
                  {/* Contacts */}
                  <Route path="/:division/contacts" element={<RequireAuth><Layout><ContactList /></Layout></RequireAuth>} />
                  <Route path="/:division/contacts/:id" element={<RequireAuth><Layout><ContactDetail /></Layout></RequireAuth>} />
                  {/* Scheduling */}
                  <Route path="/:division/scheduling" element={<RequireAuth><Layout><SchedulingPage /></Layout></RequireAuth>} />
                  {/* Field Equipment */}
                  <Route path="/:division/field-equipment" element={<RequireAuth><Layout><FieldEquipmentPage /></Layout></RequireAuth>} />
                  <Route path="/field-tech/field-equipment" element={<RequireAuth><Layout><FieldEquipmentPage /></Layout></RequireAuth>} />
                  {/* Equipment Management */}
                  <Route path="/:division/equipment" element={<RequireAuth><Layout><EquipmentPage /></Layout></RequireAuth>} />
                  {/* Equipment Maintenance */}
                  <Route path="/:division/maintenance" element={<RequireAuth><Layout><MaintenancePage /></Layout></RequireAuth>} />
                  {/* Technician Profiles */}
                  <Route path="/:division/profiles" element={<RequireAuth><Layout><TechnicianProfilesPage /></Layout></RequireAuth>} />
                  {/* Reports Management */}
                  <Route path="/:division/reports" element={<RequireAuth><Layout><ReportsPage /></Layout></RequireAuth>} />
                  {/* Resource Management */}
                  <Route path="/resources" element={<RequireAuth><Layout><ResourceManagement /></Layout></RequireAuth>} />
                  <Route path="/:division/resources" element={<RequireAuth><Layout><ResourceManagement /></Layout></RequireAuth>} />
                  {/* Jobs & Reports (now explicitly division-based or generic) */}
                  <Route path="/jobs" element={<RequireAuth><Layout><JobList /></Layout></RequireAuth>} />
                  <Route path="/all-jobs" element={<RequireAuth><Layout><UnifiedJobsPage /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id" element={<RequireAuth><Layout><JobDetail /></Layout></RequireAuth>} />
                  {/* /:division/jobs handles both /field-tech/jobs and /north_alabama/jobs etc. so division is in the URL */}
                  <Route path="/:division/jobs" element={<RequireAuth><Layout><JobList /></Layout></RequireAuth>} />
                  <Route path="/:division/jobs/:id" element={<RequireAuth><Layout><JobDetail /></Layout></RequireAuth>} />
                  
                  {/* Reports - Assuming they can be accessed generically or via division context in Layout */}
                  {/* Generated Documents (Cover Letter / Executive Summary) */}
                  <Route path="/jobs/:id/generated-document/:docId" element={<RequireAuth><Layout><GeneratedDocumentViewer /></Layout></RequireAuth>} />
                  {/* Deliverable Viewer (Cover Letter + Reports combined) */}
                  <Route path="/jobs/:jobId/deliverable/:deliverableId" element={<RequireAuth><Layout><DeliverableViewer /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/switchgear-report/:reportId?" element={<RequireAuth><Layout><SwitchgearReport /></Layout></RequireAuth>} />
                  {/* Grounding System MASTER - with and without substation folder */}
                  <Route path="/jobs/:id/grounding-system-master/:substation/:reportId" element={<RequireAuth><Layout><GroundingSystemMaster /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/grounding-system-master/:reportId?" element={<RequireAuth><Layout><GroundingSystemMaster /></Layout></RequireAuth>} />
                  {/* Grounding Fall of Potential - with and without substation folder */}
                  <Route path="/jobs/:id/grounding-fall-of-potential-slope-method-test/:substation/:reportId" element={<RequireAuth><Layout><GroundingFallOfPotentialSlopeMethodTest /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/grounding-fall-of-potential-slope-method-test/:reportId?" element={<RequireAuth><Layout><GroundingFallOfPotentialSlopeMethodTest /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/panelboard-report/:reportId?" element={<RequireAuth><Layout><PanelboardReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/dry-type-transformer/:reportId?" element={<RequireAuth><Layout><DryTypeTransformerReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/large-dry-type-transformer/:reportId?" element={<RequireAuth><Layout><LargeDryTypeTransformerReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/large-dry-type-transformer-report/:reportId?" element={<RequireAuth><Layout><LargeDryTypeTransformerReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/large-dry-type-transformer-mts-report/:reportId?" element={<RequireAuth><Layout><LargeDryTypeTransformerMTSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/large-dry-type-xfmr-mts-report/:reportId?" element={<RequireAuth><Layout><LargeDryTypeXfmrMTSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/liquid-filled-transformer/:reportId?" element={<RequireAuth><Layout><LiquidFilledTransformerReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/oil-inspection/:reportId?" element={<RequireAuth><Layout><OilInspectionReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-switch-oil-report/:reportId?" element={<RequireAuth><Layout><MediumVoltageSwitchOilReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-switch-sf6-report/:reportId?" element={<RequireAuth><Layout><MediumVoltageSwitchSF6Report /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/potential-transformer-ats-report/:reportId?" element={<RequireAuth><Layout><PotentialTransformerATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-cable-test-12sets/:reportId?" element={<RequireAuth><Layout><TwelveSetsLowVoltageCableTestForm /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-cable-test-3sets/:reportId?" element={<RequireAuth><Layout><ThreeLowVoltageCableMTSForm /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-cable-test-3sets-ats/:reportId?" element={<RequireAuth><Layout><ThreeLowVoltageCableATSForm /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-vlf-tan-delta/:reportId?" element={<RequireAuth><Layout><TanDeltaChart /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-vlf-tan-delta-mts/:reportId?" element={<RequireAuth><Layout><TanDeltaChartMTS /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-vlf/:reportId?" element={<RequireAuth><Layout><MediumVoltageVLFReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-vlf-mts-report/:reportId?" element={<RequireAuth><Layout><MediumVoltageVLFMTSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-cable-vlf-test/:reportId?" element={<RequireAuth><Layout><MediumVoltageCableVLFTest /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/metal-enclosed-busway/:reportId?" element={<RequireAuth><Layout><MetalEnclosedBuswayReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-switch-multi-device-test/:reportId?" element={<RequireAuth><Layout><LowVoltageSwitchWithPrint /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-switch-report/:reportId?" element={<RequireAuth><Layout><LowVoltageSwitchReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/mv-switch-oil/:reportId?" element={<RequireAuth><Layout><MediumVoltageSwitchOilReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-circuit-breaker-electronic-trip-ats-secondary-injection-report/:reportId?" element={<RequireAuth><Layout><LowVoltageCircuitBreakerElectronicTripATSSecondaryInjectionReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-circuit-breaker-electronic-trip-ats-report/:reportId?" element={<RequireAuth><Layout><LowVoltageCircuitBreakerElectronicTripATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-circuit-breaker-electronic-trip-mts-report/:reportId?" element={<RequireAuth><Layout><LowVoltageCircuitBreakerElectronicTripMTSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-circuit-breaker-thermal-magnetic-ats-report/:reportId?" element={<RequireAuth><Layout><LowVoltageCircuitBreakerThermalMagneticATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-circuit-breaker-thermal-magnetic-mts-report/:reportId?" element={<RequireAuth><Layout><LowVoltageCircuitBreakerThermalMagneticMTSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/lv-molded-case-circuit-breaker-ats25/:reportId?" element={<RequireAuth><Layout><LVMoldedCaseCircuitBreakerATS25Report /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/emergency-systems-engine-generator-ats25/:reportId?" element={<RequireAuth><Layout><EmergencySystemsEngineGeneratorATS25Report /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/6-low-voltage-switch-maint-mts-report/:reportId?" element={<RequireAuth><Layout><LowVoltageSwitchMaintMTSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/low-voltage-panelboard-small-breaker-report/:reportId?" element={<RequireAuth><Layout><LowVoltagePanelboardSmallBreakerTestATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-circuit-breaker-report/:reportId?" element={<RequireAuth><Layout><MediumVoltageCircuitBreakerReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/current-transformer-test-ats-report/:reportId?" element={<RequireAuth><Layout><CurrentTransformerTestATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/12-current-transformer-test-ats-report/:reportId?" element={<RequireAuth><Layout><Suspense fallback={<div>Loading...</div>}><New12CurrentTransformerTestATSReport /></Suspense></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/oil-analysis-report/:reportId?" element={<RequireAuth><Layout><OilAnalysisReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/cable-hipot-test-report/:reportId?" element={<RequireAuth><Layout><CableHiPotReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/current-transformer-test-ats-report/:reportId?" element={<RequireAuth><Layout><CurrentTransformerTestATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/12-current-transformer-test-ats-report/:reportId?" element={<RequireAuth><Layout><Suspense fallback={<div>Loading...</div>}><New12CurrentTransformerTestATSReport /></Suspense></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/relay-test-report/:reportId?" element={<RequireAuth><Layout><RelayTestReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/automatic-transfer-switch-ats-report/:reportId?" element={<RequireAuth><Layout><AutomaticTransferSwitchATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/switchgear-switchboard-assemblies-ats25/:reportId?" element={<RequireAuth><Layout><SwitchgearSwitchboardAssembliesATS25Report /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/panelboard-assemblies-ats25/:reportId?" element={<RequireAuth><Layout><PanelboardAssembliesATS25Report /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/small-lv-dry-type-transformer-ats25/:reportId?" element={<RequireAuth><Layout><SmallLowVoltageDryTypeTransformerATS25Report /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/liquid-filled-xfmr-ats25/:reportId?" element={<RequireAuth><Layout><LiquidFilledXfmrATS25Report /></Layout></RequireAuth>} />
                  
                  
                  {/* NETA Testing Services Diagnostics */}
                  <Route path="/job-diagnostics" element={<RequireAuth><Layout><JobDiagnostics /></Layout></RequireAuth>} />
                  <Route path="/:division/job-diagnostics" element={<RequireAuth><Layout><JobDiagnostics /></Layout></RequireAuth>} />

                  {/* Add this to your routes */}
                  <Route path="/db-debug" element={<RequireAuth><Layout><DatabaseDebug /></Layout></RequireAuth>} />

                  {/* Added route for SwitchgearPanelboardMTSReport */}
                  <Route path="/jobs/:id/switchgear-panelboard-mts-report/:reportId?" element={<RequireAuth><Layout><SwitchgearPanelboardMTSReport /></Layout></RequireAuth>} />

                  {/* Internal Forms - Job Hazard Analysis Form */}
                  <Route path="/jobs/:id/job-hazard-analysis-form/:reportId?" element={<RequireAuth><Layout><JobHazardAnalysisForm /></Layout></RequireAuth>} />

                  {/* Added route for LiquidXfmrVisualMTSReport */}
                  <Route path="/jobs/:id/liquid-xfmr-visual-mts-report/:reportId?" element={<RequireAuth><Layout><Suspense fallback={<div>Loading...</div>}><LiquidXfmrVisualMTSReport /></Suspense></Layout></RequireAuth>} />

                  {/* Added route for Two Small Dry Type Transformer ATS Report */}
                  <Route path="/jobs/:id/two-small-dry-typer-xfmr-ats-report/:reportId?" element={<RequireAuth><Layout><Suspense fallback={<div>Loading...</div>}><TwoSmallDryTyperXfmrATSReport /></Suspense></Layout></RequireAuth>} />

                  {/* Added route for Two Small Dry Type Transformer MTS Report */}
                  <Route path="/jobs/:id/two-small-dry-typer-xfmr-mts-report/:reportId?" element={<RequireAuth><Layout><Suspense fallback={<div>Loading...</div>}><TwoSmallDryTyperXfmrMTSReport /></Suspense></Layout></RequireAuth>} />

                  {/* Added route for the new Tan Delta Test MTS Form */}
                  <Route path="/jobs/:id/electrical-tan-delta-test-mts-form/:reportId?" element={<RequireAuth><Layout><TanDeltaTestMTSForm /></Layout></RequireAuth>} />
                  
                  {/* Added route for Medium Voltage Cable VLF Test MTS */}
                  <Route path="/jobs/:id/medium-voltage-cable-vlf-test-mts/:reportId?" element={<RequireAuth><Layout><MediumVoltageCableVLFTest /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/medium-voltage-circuit-breaker-mts-report/:reportId?" element={<RequireAuth><Layout><MediumVoltageCircuitBreakerMTSReport /></Layout></RequireAuth>} />
                  
                  {/* Added route for 12-Current Transformer Test MTS Report */}
                  <Route path="/jobs/:id/12-current-transformer-test-mts-report/:reportId?" element={<RequireAuth><Layout><Suspense fallback={<div>Loading...</div>}><New12CurrentTransformerTestMTSReport /></Suspense></Layout></RequireAuth>} />

                  {/* Added route for 13-Voltage Potential Transformer Test MTS Report */}
                  <Route path="/jobs/:id/13-voltage-potential-transformer-test-mts-report/:reportId?" element={<RequireAuth><Layout><VoltagePotentialTransformerTestMTSReport /></Layout></RequireAuth>} />

                  {/* === New Report Routes === */}
                  <Route path="/jobs/:id/23-medium-voltage-motor-starter-mts-report/:reportId?" element={<RequireAuth><Layout><MediumVoltageMotorStarterMTSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/23-medium-voltage-switch-mts-report/:reportId?" element={<RequireAuth><Layout><MediumVoltageSwitchMTSReport /></Layout></RequireAuth>} />
                  
                  {/* GFI Trip Test Report - with and without substation folder */}
                  <Route path="/jobs/:id/gfi-trip-test-report/:substation/:reportId" element={<RequireAuth><Layout><GFITripTestReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/gfi-trip-test-report/:reportId?" element={<RequireAuth><Layout><GFITripTestReport /></Layout></RequireAuth>} />
                  
                  {/* Applied Voltage Test ATS Report - with and without substation folder */}
                  <Route path="/jobs/:id/applied-voltage-test-ats-report/:substation/:reportId" element={<RequireAuth><Layout><AppliedVoltageTestATSReport /></Layout></RequireAuth>} />
                  <Route path="/jobs/:id/applied-voltage-test-ats-report/:reportId?" element={<RequireAuth><Layout><AppliedVoltageTestATSReport /></Layout></RequireAuth>} />
                </Routes>
                
                {/* Persistent My Menu Drawer */}
                <FloatingMyMenu />

                {/* Persistent Issue Reporter */}
                <FloatingIssueReporter />
                
              </Router>
          </DivisionProvider>
        </DemoModeProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;