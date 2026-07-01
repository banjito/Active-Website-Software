import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { 
  Users, 
  Award, 
  Search,
  User,
  Folder,
  DollarSign,
  History
} from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useManagerReportIds } from '../../../lib/hooks/useManagerReportIds';
import { toast } from '../../../components/ui/toast';
import { supabase } from '../../../lib/supabase';
import { DocumentStorage } from './DocumentStorage';
import { VersionTracking } from './VersionTracking';
import { CompensationView } from './CompensationView';
import { JobTitleHistoryView } from './JobTitleHistoryView';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface User {
  id: string;
  email: string;
  name?: string;
  user_metadata?: {
    name?: string;
    [key: string]: any;
  };
}

export const EmployeeFiles: React.FC = () => {
  const { user } = useAuth();
  const { getUserRole } = usePermissions();
  const isHrFullAccess = getUserRole() === 'Admin' || getUserRole() === 'Super Admin';
  const { reportIds, loading: reportIdsLoading, refetch: refetchReportIds } = useManagerReportIds(user?.id);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'documents' | 'certifications' | 'compensation' | 'employee-history'>('documents');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Always refetch org chart when you open this page so the list matches current org chart
  useEffect(() => {
    refetchReportIds();
  }, [refetchReportIds]);

  // Fetch employees we're allowed to see: Admin/Super Admin see everyone; others see self + everyone under you on org chart
  const allowedIds = [user?.id, ...reportIds].filter(Boolean) as string[];
  const allowedIdsKey = isHrFullAccess ? 'all' : allowedIds.slice().sort().join(',');
  useEffect(() => {
    if (reportIdsLoading || !user?.id) {
      if (!reportIdsLoading) setLoading(false);
      return;
    }
    const ids = [user.id, ...reportIds];
    const allowedSet = new Set(ids);
    const fetchAllowedUsers = async () => {
      setLoading(true);
      try {
        let adminData: any[] | null = null;
        let adminError: any = null;
        try {
          const res = await supabase.schema('common').rpc('admin_get_users');
          adminData = res.data;
          adminError = res.error;
          if (adminError) {
            const fallback = await supabase.rpc('admin_get_users');
            if (!fallback.error) {
              adminData = fallback.data;
              adminError = null;
            }
          }
        } catch (_) {
          adminError = true;
        }
        if (adminError || !adminData || adminData.length === 0) {
          // Non-Admin fallback: use profiles table (accessible to all users)
          let profiles: any[] = [];
          try {
            const fromCommon = await supabase.schema('common').from('profiles').select('id, email, full_name, user_metadata');
            if (!fromCommon.error && fromCommon.data) profiles = fromCommon.data;
            else {
              const fromPublic = await supabase.from('profiles').select('id, email, full_name, user_metadata');
              if (!fromPublic.error && fromPublic.data) profiles = fromPublic.data;
            }
          } catch (_) {}

          const filtered = isHrFullAccess ? profiles : profiles.filter((p: any) => allowedSet.has(p.id));

          // Guarantee the current user is always in the list even if profiles table is empty
          const list = filtered.length === 0 && user
            ? [{
                id: user.id,
                email: user.email || '',
                full_name: user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown',
                user_metadata: user.user_metadata || {},
              }]
            : filtered;

          const mapped = list.map((p: any) => ({
            id: p.id,
            email: p.email || '',
            name: p.full_name || (p.user_metadata?.name as string) || p.email?.split('@')[0] || 'Unknown',
            user_metadata: p.user_metadata || {},
          }));
          setUsers(mapped.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)));
          return;
        }
        const filteredAdmin = isHrFullAccess ? (adminData as any[]) : (adminData as any[]).filter((u: any) => allowedSet.has(u.id));
        const mapped = filteredAdmin.map((u: any) => ({
          id: u.id,
          email: u.email || '',
          name: u.raw_user_meta_data?.name || u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown',
          user_metadata: {
            name: u.raw_user_meta_data?.name || u.user_metadata?.name || null,
            ...(u.raw_user_meta_data || u.user_metadata || {}),
          },
        }));
        setUsers(mapped.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)));
      } catch (e: any) {
        // If all fetching fails, at minimum show the current user's own entry
        console.error('Error loading employees:', e);
        if (user) {
          setUsers([{
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown',
            user_metadata: user.user_metadata || {},
          }]);
        } else {
          setUsers([]);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAllowedUsers();
  }, [reportIdsLoading, user?.id, allowedIdsKey, isHrFullAccess]);

  // Clear selection if not in allowed set (Admins can view anyone so don't clear)
  useEffect(() => {
    if (reportIdsLoading || !selectedEmployeeId || isHrFullAccess) return;
    if (!allowedIds.includes(selectedEmployeeId)) setSelectedEmployeeId('');
  }, [reportIdsLoading, selectedEmployeeId, user?.id, reportIds, isHrFullAccess, allowedIds]);

  // Reset to documents tab when non-admin (compensation/employee-history tabs are hidden)
  useEffect(() => {
    if (!isHrFullAccess && (activeTab === 'compensation' || activeTab === 'employee-history')) {
      setActiveTab('documents');
    }
  }, [isHrFullAccess, activeTab]);

  const visibleEmployeeIds = new Set(allowedIds);
  const canViewThisEmployee =
    !reportIdsLoading &&
    !!selectedEmployeeId &&
    (isHrFullAccess ? users.some((u) => u.id === selectedEmployeeId) : visibleEmployeeIds.has(selectedEmployeeId));
  const canViewSensitiveData = canViewThisEmployee;

  const filteredUsers = searchQuery
    ? users.filter(u =>
        (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;

  const selectedEmployee = users.find(u => u.id === selectedEmployeeId);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Employee List Sidebar */}
      <Card className="w-80 flex-shrink-0 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Employees</CardTitle>
          <CardDescription>Select an employee to view their files</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Employee List - wait for org chart so list is only self + direct reports */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {loading || reportIdsLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No employees found
              </div>
            ) : (
              filteredUsers.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelectedEmployeeId(emp.id);
                    setActiveTab('documents'); // Reset to documents tab when selecting new employee
                  }}
                  className={`w-full text-left p-3 rounded-none transition-colors ${
                    selectedEmployeeId === emp.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-none p-2 ${
                      selectedEmployeeId === emp.id
                        ? 'bg-primary-foreground/20'
                        : 'bg-muted'
                    }`}>
                      <User className={`h-4 w-4 ${
                        selectedEmployeeId === emp.id
                          ? 'text-primary-foreground'
                          : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${
                        selectedEmployeeId === emp.id
                          ? 'text-primary-foreground'
                          : ''
                      }`}>
                        {emp.name || emp.email}
                      </div>
                      <div className={`text-xs truncate ${
                        selectedEmployeeId === emp.id
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground'
                      }`}>
                        {emp.email}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area - only show employee data when selected employee is in your visible set (self or direct reports) */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedEmployeeId && !canViewThisEmployee ? (
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center">
              <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Access restricted</h3>
              <p className="text-muted-foreground mb-4">
                You can only view files for yourself or people who directly report to you on the org chart. Select an employee from the list.
              </p>
              <Button variant="outline" onClick={() => setSelectedEmployeeId('')}>Clear selection</Button>
            </CardContent>
          </Card>
        ) : selectedEmployeeId && canViewThisEmployee ? (
          <>
            {/* Tabs */}
            <div className="flex space-x-1 border-b mb-4">
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'documents'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  Documents
                </div>
              </button>
              <button
                onClick={() => setActiveTab('certifications')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'certifications'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Certifications
                </div>
              </button>
              {isHrFullAccess && (
                <>
                  <button
                    onClick={() => setActiveTab('compensation')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'compensation'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Compensation
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('employee-history')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'employee-history'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Employee History
                    </div>
                  </button>
                </>
              )}
            </div>

            {/* Tab Content - only rendered when canViewThisEmployee */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'documents' && (
                <div className="space-y-6">
                  <DocumentStorageContent employeeId={selectedEmployeeId} employeeName={selectedEmployee?.name || selectedEmployee?.email || ''} />
                </div>
              )}
              {activeTab === 'certifications' && (
                <div className="space-y-6">
                  <VersionTrackingContent employeeId={selectedEmployeeId} employeeName={selectedEmployee?.name || selectedEmployee?.email || ''} />
                </div>
              )}
              {isHrFullAccess && activeTab === 'compensation' && selectedEmployee && (
                <CompensationView profileId={selectedEmployeeId} employeeName={selectedEmployee.name || selectedEmployee.email || ''} />
              )}
              {isHrFullAccess && activeTab === 'employee-history' && selectedEmployee && (
                <JobTitleHistoryView profileId={selectedEmployeeId} employeeName={selectedEmployee.name || selectedEmployee.email || ''} />
              )}
            </div>
          </>
        ) : (
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Select an Employee</h3>
              <p className="text-muted-foreground">
                Choose an employee from the list to view their documents and certifications
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

// Wrapper components that pass the employeeId prop
const DocumentStorageContent: React.FC<{ employeeId: string; employeeName: string }> = ({ employeeId }) => {
  return <DocumentStorage initialEmployeeId={employeeId} />;
};

const VersionTrackingContent: React.FC<{ employeeId: string; employeeName: string }> = ({ employeeId }) => {
  return <VersionTracking initialEmployeeId={employeeId} />;
};
