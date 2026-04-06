import React, { useState, useEffect, useCallback } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { Laptop, Loader2, RefreshCw, CheckCircle, Eye, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 15;
import { onboardingService, ITEquipmentTask } from '../../../services/hr/onboardingService';
import { toast } from '../../../components/ui/toast';

type TaskRow = ITEquipmentTask & { employeeName: string };

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed';

export const ITOnboarding: React.FC = () => {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<TaskRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allTasks, trackingList] = await Promise.all([
        onboardingService.getITEquipmentTasks({ is_template: false }),
        onboardingService.getOnboardingTrackingList(),
      ]);
      const assigned = allTasks.filter(
        (t) => t.employee_id && t.status !== 'cancelled'
      ) as (ITEquipmentTask & { employee_id: string })[];
      const nameByUserId = new Map<string, string>();
      trackingList.forEach((r) => {
        const uid = (r as any).user_id;
        if (uid && r.user) {
          const name = (r.user as any).name || (r.user as any).email || 'Unknown';
          nameByUserId.set(uid, name);
        }
      });
      const rows: TaskRow[] = assigned.map((t) => ({
        ...t,
        employeeName: nameByUserId.get(t.employee_id) || t.employee_id.slice(0, 8) + '…',
      }));
      setTasks(rows);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load assigned IT tasks', variant: 'destructive' });
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const paginatedTasks = filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleStatusChange = async (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    setUpdatingId(taskId);
    try {
      await onboardingService.updateITEquipmentTask(taskId, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
      toast({ title: 'Updated', description: 'Task status updated.', variant: 'success' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update status', variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Laptop className="h-8 w-8 text-[#f26722]" />
            IT Onboarding
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            See who has IT equipment tasks assigned and mark them in progress or completed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned IT tasks</CardTitle>
          <CardDescription>
            Tasks assigned to new hires from Onboarding Tracking. Change status as you work on them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {(['all', 'pending', 'in_progress', 'completed'] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={statusFilter === status ? 'bg-[#f26722] hover:bg-[#f26722]/90 text-white' : ''}
              >
                {status === 'all' ? 'All' : status === 'in_progress' ? 'In progress' : status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
          {filteredTasks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6">
              {tasks.length === 0
                ? 'No assigned IT tasks yet. Assign templates to people from Onboarding Tracking.'
                : `No tasks with status "${statusFilter === 'all' ? 'any' : statusFilter === 'in_progress' ? 'In progress' : statusFilter}".`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Employee</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Task</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Update</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTasks.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => setDetailTask(t)}
                    >
                      <td className="py-3 px-2 text-gray-900 dark:text-white">{t.employeeName}</td>
                      <td className="py-3 px-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDetailTask(t); }}
                          className="text-left font-medium text-[#f26722] hover:underline flex items-center gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                          {t.name}
                        </button>
                      </td>
                      <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                        <span
                          className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                            t.status === 'completed'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : t.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {t.status === 'in_progress' ? 'In progress' : t.status === 'completed' ? 'Completed' : 'Pending'}
                        </span>
                      </td>
                      <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                        {updatingId === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Select
                            value={t.status}
                            onChange={(e) => handleStatusChange(t.id, e.target.value as 'pending' | 'in_progress' | 'completed')}
                            options={[
                              { value: 'pending', label: 'Pending' },
                              { value: 'in_progress', label: 'In progress' },
                              { value: 'completed', label: 'Completed' },
                            ]}
                            fullWidth={false}
                            className="w-[140px]"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredTasks.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {page} of {totalPages} ({filteredTasks.length} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail modal: what to do for this person */}
      <Dialog open={!!detailTask} onOpenChange={(open) => !open && setDetailTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Laptop className="h-5 w-5 text-[#f26722]" />
              {detailTask?.name}
            </DialogTitle>
            <DialogDescription>
              For: <span className="font-medium text-gray-900 dark:text-white">{detailTask?.employeeName}</span>
              {detailTask?.description && (
                <>
                  <span className="block mt-2 text-gray-600 dark:text-gray-400">{detailTask.description}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">What to do</h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  {detailTask.equipment_category && (
                    <li>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Equipment:</span>{' '}
                      {detailTask.equipment_category}
                    </li>
                  )}
                  {detailTask.software_requirements && detailTask.software_requirements.length > 0 && (
                    <li>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Software:</span>
                      <ul className="mt-1.5 space-y-1 pl-4">
                        {detailTask.software_requirements.map((s, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                            {s.name} {s.version && `(${s.version})`}
                            {s.required && (
                              <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-1.5 py-0.5 rounded">
                                Required
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                  {detailTask.access_requirements && detailTask.access_requirements.length > 0 && (
                    <li>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Access:</span>
                      <ul className="mt-1.5 space-y-1 pl-4">
                        {detailTask.access_requirements.map((a, i) => (
                          <li key={i}>
                            {a.system}
                            {a.role && ` — ${a.role}`}
                            {a.permissions?.length ? ` (${a.permissions.join(', ')})` : ''}
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                  {!detailTask.equipment_category &&
                    (!detailTask.software_requirements || detailTask.software_requirements.length === 0) &&
                    (!detailTask.access_requirements || detailTask.access_requirements.length === 0) && (
                      <li className="text-gray-500">No specific items listed. See notes if any.</li>
                    )}
                </ul>
              </div>
              {detailTask.notes && (
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap rounded border border-gray-200 dark:border-gray-700 p-2 bg-white dark:bg-gray-800">
                    {detailTask.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex items-center gap-2 flex-wrap">
            {detailTask && (
              <>
                <span className="text-sm text-gray-500 mr-2">Status:</span>
                {updatingId === detailTask.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Select
                    value={detailTask.status}
                    onChange={(e) => {
                      const v = e.target.value as 'pending' | 'in_progress' | 'completed';
                      handleStatusChange(detailTask.id, v);
                      setDetailTask((prev) => (prev ? { ...prev, status: v } : null));
                    }}
                    options={[
                      { value: 'pending', label: 'Pending' },
                      { value: 'in_progress', label: 'In progress' },
                      { value: 'completed', label: 'Completed' },
                    ]}
                    fullWidth={false}
                    className="w-[140px]"
                  />
                )}
              </>
            )}
            <Button variant="outline" onClick={() => setDetailTask(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
