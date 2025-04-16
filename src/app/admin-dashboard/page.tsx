import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { UserPlus, UserMinus, ShieldCheck, Settings, Users, ArrowLeft, FileText, Database, Sliders } from 'lucide-react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import AdminUserManagement from '@/components/admin/AdminUserManagement';
import SystemHealthMonitoring from '@/components/admin/SystemHealthMonitoring';
import { SystemLogsCard } from '@/components/admin/SystemLogsCard';
import { PortalConfiguration } from '@/components/admin/PortalConfiguration';
import { DataBackupControls } from '@/components/admin/DataBackupControls';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<'dashboard' | 'userManagement' | 'systemHealth' | 'systemLogs' | 'portalConfig' | 'dataBackup'>('dashboard');

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

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center mb-8">
        <Button 
          variant="ghost" 
          className="mr-4" 
          onClick={handleBackClick}
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {currentView === 'dashboard' 
            ? 'Admin Dashboard' 
            : currentView === 'userManagement' 
              ? 'User Management' 
              : currentView === 'systemHealth'
                ? 'System Health'
                : currentView === 'systemLogs'
                  ? 'System Logs'
                  : currentView === 'portalConfig'
                    ? 'Portal Configuration'
                    : 'Data Backup Controls'}
        </h1>
      </div>

      {currentView === 'dashboard' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full mr-4">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Users</p>
                    <h3 className="text-2xl font-bold">147</h3>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-full mr-4">
                    <UserPlus className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">New Users (30d)</p>
                    <h3 className="text-2xl font-bold">12</h3>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full mr-4">
                    <ShieldCheck className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Security Alerts</p>
                    <h3 className="text-2xl font-bold">3</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-gray-500 dark:text-gray-400">
                  Manage user accounts, roles, and permissions.
                </p>
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => setCurrentView('userManagement')}>
                    <Users className="mr-2 h-4 w-4" />
                    View All
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-gray-500 dark:text-gray-400">
                  Monitor system health and configure system-wide settings.
                </p>
                <div className="flex space-x-2">
                  <Button onClick={() => setCurrentView('systemHealth')}>
                    <Settings className="mr-2 h-4 w-4" />
                    System Health
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-gray-500 dark:text-gray-400">
                  View recent system activities and notifications.
                </p>
                <div className="flex space-x-2">
                  <Button onClick={() => setCurrentView('systemLogs')}>
                    <FileText className="mr-2 h-4 w-4" />
                    View Logs
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Portal Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-gray-500 dark:text-gray-400">
                  Customize portal appearance, features, and behavior.
                </p>
                <div className="flex space-x-2">
                  <Button onClick={() => setCurrentView('portalConfig')}>
                    <Sliders className="mr-2 h-4 w-4" />
                    Configure
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Backup Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-gray-500 dark:text-gray-400">
                  Manage data backups, schedule automatic backups, and restore data.
                </p>
                <div className="flex space-x-2">
                  <Button onClick={() => setCurrentView('dataBackup')}>
                    <Database className="mr-2 h-4 w-4" />
                    Manage Backups
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : currentView === 'userManagement' ? (
        <AdminUserManagement />
      ) : currentView === 'systemHealth' ? (
        <SystemHealthMonitoring />
      ) : currentView === 'systemLogs' ? (
        <SystemLogsCard />
      ) : currentView === 'portalConfig' ? (
        <PortalConfiguration />
      ) : (
        <DataBackupControls />
      )}
    </div>
  );
};

// Add both export styles to ensure compatibility with different import methods
export default AdminDashboard; 