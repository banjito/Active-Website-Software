import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { UserPlus, UserMinus, ShieldCheck, Settings, Users, ArrowLeft, FileText, Database, Sliders, LockKeyhole, Shield, Bell, Clock, Link2, DollarSign, ClipboardList } from 'lucide-react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import AdminUserManagement from '@/components/admin/AdminUserManagement';
import SystemHealthMonitoring from '@/components/admin/SystemHealthMonitoring';
import { SystemLogsCard } from '@/components/admin/SystemLogsCard';
import { PortalConfiguration } from '@/components/admin/PortalConfiguration';
import { DataBackupControls } from '@/components/admin/DataBackupControls';
import { EncryptionSettings } from '@/components/admin/EncryptionSettings';
import RoleManagement from '@/components/admin/RoleManagement';
import PermissionManagement from '@/components/admin/PermissionManagement';
import NotificationDevControls from '@/components/admin/NotificationDevControls';
import InProgressDashboard from '@/components/admin/InProgressDashboard';
import IntegrationsSettings from '@/components/admin/IntegrationsSettings';
import QuickBooksDashboard from '@/components/admin/QuickBooksDashboard';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<
    'dashboard' | 
    'userManagement' | 
    'systemHealth' | 
    'systemLogs' | 
    'portalConfig' | 
    'dataBackup' | 
    'encryptionSettings' |
    'roleManagement' |
    'permissionManagement' |
    'notifDevControls' |
    'inProgressDashboard' |
    'integrations' |
    'quickbooks'
  >('dashboard');

  // Redirect non-admin users
  React.useEffect(() => {
    if (user && user.user_metadata?.role !== 'Admin') {
      navigate('/portal');
    }
  }, [user, navigate]);

  if (!user || user.user_metadata?.role !== 'Admin') {
    return <div className="p-10">Loading or unauthorized access...</div>;
  }

  const handleBackClick = () => {
    if (currentView === 'dashboard') {
      navigate('/portal');
    } else {
      setCurrentView('dashboard');
    }
  };

  // Render current view based on state
  const renderView = () => {
    switch (currentView) {
      case 'userManagement':
        return <AdminUserManagement />;
      case 'systemHealth':
        return <SystemHealthMonitoring />;
      case 'systemLogs':
        return <SystemLogsCard />;
      case 'portalConfig':
        return <PortalConfiguration />;
      case 'dataBackup':
        return <DataBackupControls />;
      case 'encryptionSettings':
        return <EncryptionSettings />;
      case 'roleManagement':
        return <RoleManagement />;
      case 'permissionManagement':
        return <PermissionManagement />;
      case 'notifDevControls':
        return <NotificationDevControls />;
      case 'inProgressDashboard':
        return <InProgressDashboard />;
      case 'integrations':
        return <IntegrationsSettings />;
      case 'quickbooks':
        return <QuickBooksDashboard />;
      default:
        return renderDashboard();
    }
  };

  // Render the main dashboard cards
  const renderDashboard = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* In Progress Dashboard Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('inProgressDashboard')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">In Progress Dashboard</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Monitor ongoing jobs, projects, and tasks</p>
              </div>
              <Clock className="h-8 w-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>

        {/* User Management Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('userManagement')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">User Management</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Manage users, roles, and permissions</p>
              </div>
              <Users className="h-8 w-8 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        {/* Role Management Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('roleManagement')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Role Management</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Define and assign user roles</p>
              </div>
              <ShieldCheck className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        {/* Permission Management Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('permissionManagement')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Permission Management</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Fine-grained access control for users</p>
              </div>
              <Shield className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        {/* Notification Dev Controls Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('notifDevControls')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Notification Dev Controls</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Hide/unhide jobs from portal notifications (local)</p>
              </div>
              <Bell className="h-8 w-8 text-rose-500" />
            </div>
          </CardContent>
        </Card>

        {/* System Health Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('systemHealth')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">System Health</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Monitor system performance and status</p>
              </div>
              <Settings className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        {/* System Logs Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('systemLogs')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">System Logs</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">View system logs and audit trails</p>
              </div>
              <FileText className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        {/* Portal Configuration Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('portalConfig')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Portal Configuration</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Customize portal appearance and behavior</p>
              </div>
              <Sliders className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        {/* Data Backup Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('dataBackup')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Data Backup</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Manage data backups and recovery</p>
              </div>
              <Database className="h-8 w-8 text-teal-500" />
            </div>
          </CardContent>
        </Card>

        {/* Encryption Settings Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('encryptionSettings')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Encryption Settings</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Manage encryption keys and settings</p>
              </div>
              <LockKeyhole className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        {/* Integrations Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('integrations')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Integrations</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">QuickBooks and external services</p>
              </div>
              <Link2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        {/* QuickBooks Dashboard Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => setCurrentView('quickbooks')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">QuickBooks Dashboard</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">View customers, invoices, and estimates</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        {/* Custom Report Builder Card */}
        <Card className="transition-all hover:shadow-md cursor-pointer" onClick={() => navigate('/custom-forms/templates')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg mb-2">Custom Report Builder</CardTitle>
                <p className="text-sm text-gray-500 dark:text-white">Create and manage custom form templates for equipment testing</p>
              </div>
              <ClipboardList className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center">
        <Button 
          variant="outline" 
          className="mr-4"
          onClick={handleBackClick}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentView === 'dashboard' ? 'Back to Portal' : 'Back to Dashboard'}
        </Button>
        <h1 className="text-2xl font-bold">
          {currentView === 'dashboard' ? 'Admin Dashboard' : (
            currentView === 'inProgressDashboard' ? 'In Progress Dashboard' :
            currentView === 'userManagement' ? 'User Management' :
            currentView === 'systemHealth' ? 'System Health' : 
            currentView === 'systemLogs' ? 'System Logs' :
            currentView === 'portalConfig' ? 'Portal Configuration' :
            currentView === 'dataBackup' ? 'Data Backup' :
            currentView === 'encryptionSettings' ? 'Encryption Settings' :
            currentView === 'roleManagement' ? 'Role Management' :
            currentView === 'permissionManagement' ? 'Permission Management' :
            currentView === 'notifDevControls' ? 'Notification Dev Controls' :
            currentView === 'integrations' ? 'Integrations' :
            currentView === 'quickbooks' ? 'QuickBooks Dashboard' :
            'Admin Dashboard'
          )}
        </h1>
      </div>
      {renderView()}
    </div>
  );
};

export default AdminDashboard; 