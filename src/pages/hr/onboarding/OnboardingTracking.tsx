import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { onboardingService, OnboardingTrackingRecord, NewHirePacket, ESignForm, Checklist, ITEquipmentTask } from '../../../services/hr/onboardingService';
import { useAuth } from '../../../lib/AuthContext';
import { toast } from '../../../components/ui/toast';
import { supabase } from '../../../lib/supabase';
import { Input } from '../../../components/ui/Input';
import { UserPlus, Folder, Loader2, ChevronRight, ChevronLeft, Link2, User, Search, UserMinus, FileSignature, X, CheckSquare, Laptop, Mail, CheckCircle2 } from 'lucide-react';

const PAGE_SIZE = 15;

type AmpOSUser = { id: string; email: string; name: string };

export const OnboardingTracking: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState<OnboardingTrackingRecord[]>([]);
  const [packetTemplates, setPacketTemplates] = useState<NewHirePacket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedTracking, setSelectedTracking] = useState<OnboardingTrackingRecord | null>(null);
  const [assigningInModal, setAssigningInModal] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [ampOSUsers, setAmpOSUsers] = useState<AmpOSUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [removingTrackingId, setRemovingTrackingId] = useState<string | null>(null);
  const [eSignForms, setESignForms] = useState<ESignForm[]>([]);
  const [assigningForm, setAssigningForm] = useState(false);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [assigningChecklist, setAssigningChecklist] = useState(false);
  const [itTasks, setItTasks] = useState<ITEquipmentTask[]>([]);
  const [assigningITTask, setAssigningITTask] = useState(false);
  const [linkAccountSearch, setLinkAccountSearch] = useState('');
  const [linkAccountResults, setLinkAccountResults] = useState<AmpOSUser[]>([]);
  const [linkAccountLoading, setLinkAccountLoading] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);

  useEffect(() => {
    fetchData();
    fetchPacketsForAssign();
    (async () => {
      try {
        const all = await onboardingService.getESignForms({});
        setESignForms(all.filter((f) => f.status !== 'archived'));
      } catch {
        setESignForms([]);
      }
    })();
    (async () => {
      try {
        const all = await onboardingService.getChecklists({});
        setChecklists(all.filter((c) => c.status !== 'archived'));
      } catch {
        setChecklists([]);
      }
    })();
    (async () => {
      try {
        const templates = await onboardingService.getITEquipmentTasks({ is_template: true });
        setItTasks(templates.filter((t) => t.status !== 'cancelled'));
      } catch {
        setItTasks([]);
      }
    })();
  }, []);

  const fetchData = async (): Promise<OnboardingTrackingRecord[]> => {
    try {
      setLoading(true);
      const data = await onboardingService.getOnboardingTrackingList();
      setList(data);
      return data;
    } catch (error: any) {
      console.error('Error fetching onboarding tracking:', error);
      toast({
        title: 'Error',
        description: 'Failed to load onboarding tracking.',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchPacketsForAssign = async () => {
    try {
      const data = await onboardingService.getPackets({ custom_only: true });
      setPacketTemplates(data);
    } catch {
      setPacketTemplates([]);
    }
  };

  const fetchAmpOSUsers = async (): Promise<any[]> => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase.schema('common').rpc('admin_get_users');
      if (error) {
        const fallback = await supabase.rpc('admin_get_users');
        if (fallback.error) throw fallback.error;
        return (fallback.data || []) as any[];
      }
      return (data || []) as any[];
    } finally {
      setUsersLoading(false);
    }
  };

  const handleOpenAddPerson = async () => {
    setAddPersonOpen(true);
    setSelectedUserId('');
    setUserSearchTerm('');
    const raw = await fetchAmpOSUsers();
    const users: AmpOSUser[] = raw.map((u: any) => ({
      id: u.id,
      email: u.email || '',
      name: u.raw_user_meta_data?.name || u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown',
    }));
    setAmpOSUsers(users);
  };

  const handleAddPerson = async () => {
    if (!selectedUserId || !user?.id) return;
    setAddingPerson(true);
    try {
      await onboardingService.createOnboardingTrackingForUser(selectedUserId, user.id);
      toast({ title: 'Added', description: 'Person added to onboarding. Assign packets and update status as needed.', variant: 'success' });
      setAddPersonOpen(false);
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to add person', variant: 'destructive' });
    } finally {
      setAddingPerson(false);
    }
  };

  const handleRemoveFromOnboarding = async (trackingId: string) => {
    setRemovingTrackingId(trackingId);
    try {
      await onboardingService.deleteOnboardingTracking(trackingId);
      toast({ title: 'Removed', description: 'Person removed from onboarding.', variant: 'success' });
      setSelectedTracking(null);
      fetchData();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to remove from onboarding', variant: 'destructive' });
    } finally {
      setRemovingTrackingId(null);
    }
  };

  const handleStatusChange = async (id: string, status: 'pending' | 'in_progress' | 'completed') => {
    try {
      await onboardingService.updateOnboardingTrackingStatus(id, status);
      toast({ title: 'Updated', description: 'Status updated.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === id) setSelectedTracking(data.find(r => r.id === id) || selectedTracking);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleAssignPacket = async (trackingId: string, templateId: string) => {
    if (!user?.id) return;
    setAssigningInModal(true);
    try {
      await onboardingService.assignPacketToTracking(trackingId, templateId, user.id);
      toast({ title: 'Packet assigned', description: 'New Hire Packet created and linked.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (error: any) {
      const msg = error?.message || 'Failed to assign packet';
      const hint = /relation|does not exist|onboarding_tracking_packets/i.test(msg)
        ? ' Run the migration: 2025_hr_onboarding_tracking_packets.sql'
        : '';
      toast({ title: 'Error', description: msg + hint, variant: 'destructive' });
    } finally {
      setAssigningInModal(false);
    }
  };

  const handleAssignForm = async (trackingId: string, formId: string) => {
    setAssigningForm(true);
    try {
      await onboardingService.assignFormToTracking(trackingId, formId);
      toast({ title: 'Form assigned', description: 'E-Sign form is now visible to the employee in Your Onboarding.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to assign form', variant: 'destructive' });
    } finally {
      setAssigningForm(false);
    }
  };

  const handleRemoveForm = async (trackingId: string, formId: string) => {
    try {
      await onboardingService.removeFormFromTracking(trackingId, formId);
      toast({ title: 'Form removed', description: 'E-Sign form unassigned from this onboarding.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to remove form', variant: 'destructive' });
    }
  };

  const handleAssignChecklist = async (trackingId: string, checklistId: string) => {
    if (!user?.id) return;
    setAssigningChecklist(true);
    try {
      await onboardingService.assignChecklistToTracking(trackingId, checklistId, user.id);
      toast({ title: 'Checklist assigned', description: 'Checklist is visible to the employee in Your Onboarding.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to assign checklist', variant: 'destructive' });
    } finally {
      setAssigningChecklist(false);
    }
  };

  const handleRemoveChecklist = async (trackingId: string, checklistId: string) => {
    try {
      await onboardingService.removeChecklistFromTracking(trackingId, checklistId);
      toast({ title: 'Checklist removed', description: 'Checklist unassigned from this onboarding.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to remove checklist', variant: 'destructive' });
    }
  };

  const handleAssignITTask = async (trackingId: string, templateTaskId: string) => {
    if (!user?.id) return;
    setAssigningITTask(true);
    try {
      await onboardingService.assignITTaskToTracking(trackingId, templateTaskId, user.id);
      toast({ title: 'IT task assigned', description: 'A copy of the task was created and assigned to this person.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to assign IT task', variant: 'destructive' });
    } finally {
      setAssigningITTask(false);
    }
  };

  const handleRemoveITTask = async (trackingId: string, taskId: string) => {
    try {
      await onboardingService.removeITTaskFromTracking(trackingId, taskId);
      toast({ title: 'IT task removed', description: 'Task unlinked from this onboarding (task itself was not deleted).', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to remove IT task', variant: 'destructive' });
    }
  };

  const searchWorkAccounts = async (term: string) => {
    setLinkAccountSearch(term);
    if (term.length < 2) {
      setLinkAccountResults([]);
      return;
    }
    try {
      setLinkAccountLoading(true);
      const { data, error } = await supabase.schema('common').rpc('admin_get_users');
      let rawUsers: any[] = [];
      if (error) {
        const fallback = await supabase.rpc('admin_get_users');
        rawUsers = (fallback.data || []) as any[];
      } else {
        rawUsers = (data || []) as any[];
      }
      const users: AmpOSUser[] = rawUsers
        .filter((u: any) => {
          const email = (u.email || '').toLowerCase();
          const name = (u.raw_user_meta_data?.name || u.user_metadata?.name || '').toLowerCase();
          const search = term.toLowerCase();
          return email.includes(search) || name.includes(search);
        })
        .slice(0, 10)
        .map((u: any) => ({
          id: u.id,
          email: u.email || '',
          name: u.raw_user_meta_data?.name || u.user_metadata?.name || u.email?.split('@')[0] || 'Unknown',
        }));
      setLinkAccountResults(users);
    } catch {
      setLinkAccountResults([]);
    } finally {
      setLinkAccountLoading(false);
    }
  };

  const handleLinkAccount = async (trackingId: string, userId: string, userEmail: string) => {
    setLinkingAccount(true);
    try {
      await onboardingService.linkUserToTracking(trackingId, userId);
      toast({ title: 'Account linked', description: `Work account ${userEmail} linked. The user will see their onboarding when they log in.`, variant: 'success' });
      setLinkAccountSearch('');
      setLinkAccountResults([]);
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to link account', variant: 'destructive' });
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleUnlinkAccount = async (trackingId: string) => {
    setLinkingAccount(true);
    try {
      await onboardingService.unlinkUserFromTracking(trackingId);
      toast({ title: 'Account unlinked', description: 'Work account removed from this onboarding record.', variant: 'success' });
      const data = await fetchData();
      if (selectedTracking?.id === trackingId) setSelectedTracking(data.find(r => r.id === trackingId) || null);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to unlink account', variant: 'destructive' });
    } finally {
      setLinkingAccount(false);
    }
  };

  const filtered = filterStatus === 'all'
    ? list
    : list.filter(r => r.status === filterStatus);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
  ];

  const filteredAddPersonUsers = userSearchTerm.trim()
    ? ampOSUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(userSearchTerm.trim().toLowerCase()) ||
          u.email.toLowerCase().includes(userSearchTerm.trim().toLowerCase())
      )
    : ampOSUsers;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Onboarding Tracking</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Assign people to onboarding (ampOS users), then assign packets and send tasks. Packets and tasks sync to Your Onboarding, Checklists, and IT/Equipment Tasks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tracking list</CardTitle>
          <CardDescription>
            Add people from your ampOS users, assign packet templates, and manage status. Assigned packets appear in Their Onboarding; you can also assign checklists and IT tasks to the same person.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Button
              onClick={handleOpenAddPerson}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add person
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <UserPlus className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p>No onboarding records yet.</p>
              <p className="text-sm mt-2">Click &quot;Add person&quot; to assign an ampOS user to onboarding, then assign packets and manage status.</p>
            </div>
          ) : (
            <>
            <div className="space-y-3">
              {paginated.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTracking(record)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                      {record.user
                        ? (record.user.name || record.user.email)
                        : record.candidate
                        ? `${record.candidate.first_name} ${record.candidate.last_name}`
                        : 'Unknown'}
                      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {record.offer
                        ? `${record.offer.position_title} – ${record.offer.department}`
                        : record.candidate?.email
                        ? record.candidate.email
                        : record.user
                        ? record.user.email
                        : '—'}
                      {record.candidate?.position_applied && !record.offer && (
                        <span className="ml-2 text-xs text-gray-400">({record.candidate.position_applied})</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 flex flex-wrap items-center gap-x-2">
                      <span>Added {new Date(record.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</span>
                      {record.user ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Account linked
                        </span>
                      ) : record.candidate && (
                        <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                          No account linked
                        </span>
                      )}
                      {(record.assigned_packets?.length ?? 0) > 0 && (
                        <span>· {(record.assigned_packets?.length ?? 0)} packet(s)</span>
                      )}
                      {(record.assigned_forms?.length ?? 0) > 0 && (
                        <span>· {(record.assigned_forms?.length ?? 0)} form(s)</span>
                      )}
                      {(record.assigned_checklists?.length ?? 0) > 0 && (
                        <span>· {(record.assigned_checklists?.length ?? 0)} checklist(s)</span>
                      )}
                      {(record.assigned_it_tasks?.length ?? 0) > 0 && (
                        <span>· {(record.assigned_it_tasks?.length ?? 0)} IT task(s)</span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={record.status}
                      onChange={(e) => handleStatusChange(record.id, e.target.value as 'pending' | 'in_progress' | 'completed')}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTracking(record)}
                      title="Manage packets"
                    >
                      <Folder className="h-4 w-4 mr-1" />
                      Packets
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {page} of {totalPages} ({filtered.length} total)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Assign packets modal – click row to open */}
      <Dialog open={!!selectedTracking} onOpenChange={(open) => !open && setSelectedTracking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedTracking?.user
                ? (selectedTracking.user.name || selectedTracking.user.email)
                : selectedTracking?.candidate
                ? `${selectedTracking.candidate.first_name} ${selectedTracking.candidate.last_name}`
                : 'Person'}
            </DialogTitle>
            <DialogDescription>
              {selectedTracking?.offer && `${selectedTracking.offer.position_title} – ${selectedTracking.offer.department}. `}
              {selectedTracking?.user && `${selectedTracking.user.email}. `}
              Assign packets and E-Sign forms below. New hires see them in Your Onboarding to view/sign.
            </DialogDescription>
          </DialogHeader>
          {selectedTracking && (
            <div className="space-y-4 py-2">
              {/* Applicant info (reference only, not a linked account) */}
              {selectedTracking.candidate && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Mail className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Applicant Email</p>
                    <p className="text-sm text-gray-900 dark:text-white truncate">{selectedTracking.candidate.email}</p>
                  </div>
                  {selectedTracking.candidate.position_applied && (
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full whitespace-nowrap">
                      {selectedTracking.candidate.position_applied}
                    </span>
                  )}
                </div>
              )}

              {/* Link Work Account – search users */}
              <div className="border-2 border-[#f26722]/30 rounded-lg p-4 bg-orange-50 dark:bg-orange-900/10">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[#f26722]" />
                  Work Account
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Link this onboarding to the employee's work account so they see their packets, forms, and checklists when they log in.
                </p>

                {selectedTracking.user ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{selectedTracking.user.name || selectedTracking.user.email}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{selectedTracking.user.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnlinkAccount(selectedTracking.id)}
                        disabled={linkingAccount}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Unlink
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <span className="text-xs text-yellow-700 dark:text-yellow-300">No work account linked yet. Search below once the account has been created.</span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={linkAccountSearch}
                        onChange={(e) => searchWorkAccounts(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                      />
                      {linkAccountLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>
                    {linkAccountResults.length > 0 && (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                        {linkAccountResults.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleLinkAccount(selectedTracking.id, u.id, u.email)}
                            disabled={linkingAccount}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-left border-b last:border-0 border-gray-100 dark:border-gray-700"
                          >
                            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                            </div>
                            <Link2 className="h-4 w-4 text-[#f26722] flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                    {linkAccountSearch.length >= 2 && linkAccountResults.length === 0 && !linkAccountLoading && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        No matching accounts found. Make sure the employee has created their account first.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Once a work account is linked, the employee sees their onboarding at <strong>Your Onboarding</strong>.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/hr/onboarding/your-onboarding`;
                    navigator.clipboard.writeText(url).then(
                      () => toast({ title: 'Link copied', description: 'Share this link with the new hire so they can view their packets.', variant: 'success' }),
                      () => toast({ title: 'Copy failed', variant: 'destructive' })
                    );
                  }}
                  className="flex-shrink-0"
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  Copy link
                </Button>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assigned packets</p>
                {(selectedTracking.assigned_packets?.length ?? 0) === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No packets assigned yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedTracking.assigned_packets!.map((p) => (
                      <li key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{p.name}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/hr/onboarding/new-hire-packets?packetId=${p.id}`)}
                        >
                          <Folder className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assign packet</p>
                <div className="flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) handleAssignPacket(selectedTracking.id, id);
                      e.target.value = '';
                    }}
                    disabled={assigningInModal || packetTemplates.length === 0}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">
                      {packetTemplates.length === 0 ? 'No packets – create one in New Hire Packets' : 'Choose a packet to assign...'}
                    </option>
                    {packetTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {assigningInModal && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assigned E-Sign forms</p>
                {(selectedTracking.assigned_forms?.length ?? 0) === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No E-Sign forms assigned. Assign forms below for the employee to sign in Your Onboarding.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedTracking.assigned_forms!.map((f) => (
                      <li key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800 gap-2">
                        <span className="text-sm text-gray-900 dark:text-white truncate flex-1 flex items-center gap-1.5">
                          <FileSignature className="h-3.5 w-3.5 flex-shrink-0" />
                          {f.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-500 hover:text-red-600 h-8 w-8 p-0"
                          onClick={() => handleRemoveForm(selectedTracking.id, f.id)}
                          title="Remove form from onboarding"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assign E-Sign form</p>
                <div className="flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) handleAssignForm(selectedTracking.id, id);
                      e.target.value = '';
                    }}
                    disabled={assigningForm || eSignForms.length === 0}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">
                      {eSignForms.length === 0 ? 'No active E-Sign forms – create one in E-Sign Forms' : 'Choose a form to assign...'}
                    </option>
                    {eSignForms
                      .filter((form) => !selectedTracking.assigned_forms?.some((af) => af.id === form.id))
                      .map((form) => (
                        <option key={form.id} value={form.id}>{form.name}</option>
                      ))}
                  </select>
                  {assigningForm && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assigned checklists</p>
                {(selectedTracking.assigned_checklists?.length ?? 0) === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No checklists assigned. Assign checklists below for the employee to complete in Your Onboarding.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedTracking.assigned_checklists!.map((c) => (
                      <li key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800 gap-2">
                        <span className="text-sm text-gray-900 dark:text-white truncate flex-1 flex items-center gap-1.5">
                          <CheckSquare className="h-3.5 w-3.5 flex-shrink-0" />
                          {c.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/hr/onboarding/checklists?checklistId=${c.id}`)}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-500 hover:text-red-600 h-8 w-8 p-0"
                            onClick={() => handleRemoveChecklist(selectedTracking.id, c.id)}
                            title="Remove checklist from onboarding"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assign checklist</p>
                <div className="flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) handleAssignChecklist(selectedTracking.id, id);
                      e.target.value = '';
                    }}
                    disabled={assigningChecklist || checklists.length === 0}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">
                      {checklists.length === 0 ? 'No checklists – create one in Checklists' : 'Choose a checklist to assign...'}
                    </option>
                    {checklists
                      .filter((cl) => !selectedTracking.assigned_checklists?.some((ac) => ac.id === cl.id))
                      .map((cl) => (
                        <option key={cl.id} value={cl.id}>{cl.name}</option>
                      ))}
                  </select>
                  {assigningChecklist && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assigned IT/Equipment tasks</p>
                {(selectedTracking.assigned_it_tasks?.length ?? 0) === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No IT/Equipment tasks assigned. Assign below to create a copy for this person.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedTracking.assigned_it_tasks!.map((t) => (
                      <li key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800 gap-2">
                        <span className="text-sm text-gray-900 dark:text-white truncate flex-1 flex items-center gap-1.5">
                          <Laptop className="h-3.5 w-3.5 flex-shrink-0" />
                          {t.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/hr/onboarding/it-equipment-tasks?taskId=${t.id}`)}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-500 hover:text-red-600 h-8 w-8 p-0"
                            onClick={() => handleRemoveITTask(selectedTracking.id, t.id)}
                            title="Remove task from onboarding"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assign IT/Equipment task</p>
                <div className="flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) handleAssignITTask(selectedTracking.id, id);
                      e.target.value = '';
                    }}
                    disabled={assigningITTask || itTasks.length === 0}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">
                      {itTasks.length === 0 ? 'No IT tasks – create one in IT/Equipment Tasks' : 'Choose a task to assign (a copy will be created)...'}
                    </option>
                    {itTasks.map((task) => (
                      <option key={task.id} value={task.id}>{task.name}</option>
                    ))}
                  </select>
                  {assigningITTask && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {selectedTracking && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemoveFromOnboarding(selectedTracking.id)}
                disabled={removingTrackingId === selectedTracking.id}
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                {removingTrackingId === selectedTracking.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserMinus className="h-4 w-4 mr-2" />
                )}
                Remove from onboarding
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedTracking(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add person to onboarding – pick from ampOS users */}
      <Dialog open={addPersonOpen} onOpenChange={setAddPersonOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Add person to onboarding
            </DialogTitle>
            <DialogDescription>
              Select an ampOS user to add to onboarding. They will see assigned packets in Your Onboarding; you can assign packets, checklists, and IT/Equipment tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {usersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="pl-9 w-full"
                    autoComplete="off"
                    name="onboarding-user-search"
                  />
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  {filteredAddPersonUsers.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No users match your search.
                    </div>
                  ) : (
                    filteredAddPersonUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUserId(selectedUserId === u.id ? '' : u.id)}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                          selectedUserId === u.id ? 'bg-[#f26722]/10 dark:bg-[#f26722]/20' : ''
                        }`}
                      >
                        <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate">{u.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</div>
                        </div>
                        {selectedUserId === u.id && (
                          <span className="text-[#f26722] text-sm font-medium">Selected</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPersonOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPerson}
              disabled={!selectedUserId || addingPerson}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              {addingPerson ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add to onboarding
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
