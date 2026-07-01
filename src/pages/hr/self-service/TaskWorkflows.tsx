import React, { useState, useEffect, useCallback } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { CheckSquare, Bell, Loader2, Calendar, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { onboardingService, ITEquipmentTask } from '../../../services/hr/onboardingService';
import { toast } from '../../../components/ui/toast';
import { Link } from 'react-router-dom';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return '—';
  }
}

function isOverdue(due: string | null | undefined): boolean {
  if (!due) return false;
  try {
    const d = new Date(due);
    d.setHours(23, 59, 59, 999);
    return d < new Date();
  } catch {
    return false;
  }
}

function isDueWithinDays(due: string | null | undefined, days: number): boolean {
  if (!due) return false;
  try {
    const d = new Date(due);
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + days);
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return d >= now && d <= end;
  } catch {
    return false;
  }
}

export const TaskWorkflows: React.FC = () => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<ITEquipmentTask[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await onboardingService.getITEquipmentTasks({ assigned_to: user.id });
      setAssignments(data || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load tasks', variant: 'destructive' });
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const reminders = assignments.filter(
    (t) =>
      t.status !== 'completed' &&
      t.status !== 'cancelled' &&
      (isOverdue(t.due_date) || isDueWithinDays(t.due_date, 14))
  );
  const pendingOrInProgress = assignments.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground dark:text-dark-foreground">Task Workflows</h1>
        <p className="text-sm text-muted-foreground dark:text-dark-500 mt-1">
          Your assigned tasks and upcoming reminders.
        </p>
      </div>

      {/* Reminders (overdue or due in 14 days) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Reminders</CardTitle>
            {reminders.length > 0 && (
              <span className="rounded-none bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-medium px-2 py-0.5">
                {reminders.length}
              </span>
            )}
          </div>
          <CardDescription>
            Tasks that are overdue or due in the next 14 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming or overdue reminders.</p>
          ) : (
            <ul className="space-y-3">
              {reminders.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4 rounded-none border border-border dark:border-dark-200 p-3 bg-muted/30 dark:bg-dark-150"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground dark:text-dark-foreground truncate">{t.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{STATUS_LABELS[t.status] ?? t.status}</span>
                      <span>•</span>
                      <span>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>
                      {t.due_date && (
                        <>
                          <span>•</span>
                          <span className={isOverdue(t.due_date) ? 'text-destructive font-medium' : ''}>
                            Due {formatDate(t.due_date)}
                            {isOverdue(t.due_date) && ' (overdue)'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/hr/onboarding/it-equipment-tasks">Open</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* My assignments */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-muted-foreground" />
            <CardTitle>My assignments</CardTitle>
          </div>
          <CardDescription>
            Tasks assigned to you (onboarding IT equipment tasks). Manage them in Onboarding → IT Equipment Tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no tasks assigned. Assignments from onboarding IT equipment workflows will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-dark-200">
                    <th className="text-left py-2 font-medium">Task</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Priority</th>
                    <th className="text-left py-2 font-medium">Due date</th>
                    <th className="text-right py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 dark:border-dark-200/50">
                      <td className="py-2">
                        <span className="font-medium">{t.name}</span>
                        {t.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{t.description}</p>
                        )}
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            t.status === 'completed'
                              ? 'text-green-600 dark:text-green-400'
                              : t.status === 'cancelled'
                              ? 'text-muted-foreground'
                              : ''
                          }
                        >
                          {STATUS_LABELS[t.status] ?? t.status}
                        </span>
                      </td>
                      <td className="py-2">{PRIORITY_LABELS[t.priority] ?? t.priority}</td>
                      <td className="py-2">
                        {t.due_date ? (
                          <span className={isOverdue(t.due_date) && t.status !== 'completed' ? 'text-destructive' : ''}>
                            {formatDate(t.due_date)}
                            {isOverdue(t.due_date) && t.status !== 'completed' && (
                              <AlertCircle className="inline h-3.5 w-3.5 ml-1 text-destructive" />
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/hr/onboarding/it-equipment-tasks">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {assignments.length > 0 && (
            <div className="mt-4">
              <Button variant="outline" size="sm" asChild>
                <Link to="/hr/onboarding/it-equipment-tasks">
                  <Clock className="mr-2 h-3.5 w-3.5" />
                  Open IT Equipment Tasks
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
