import React, { useState, useEffect, useCallback } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  Briefcase,
  Loader2,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  onboardingService,
  OfficeAdminTask,
} from "../../../services/hr/onboardingService";
import { toast } from "../../../components/ui/toast";

const PAGE_SIZE = 15;

type TaskRow = OfficeAdminTask & { employeeName: string };

type StatusFilter = "all" | "pending" | "in_progress" | "completed";

export const OfficeAdminOnboarding: React.FC = () => {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<TaskRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allTasks, trackingList] = await Promise.all([
        onboardingService.getOfficeAdminTasks({ is_template: false }),
        onboardingService.getOnboardingTrackingList(),
      ]);
      const assigned = allTasks.filter(
        (t) => t.employee_id && t.status !== "cancelled",
      ) as (OfficeAdminTask & { employee_id: string })[];
      const nameByUserId = new Map<string, string>();
      trackingList.forEach((r) => {
        const uid = (r as any).user_id;
        if (uid && r.user) {
          const name =
            (r.user as any).name || (r.user as any).email || "Unknown";
          nameByUserId.set(uid, name);
        }
      });
      const rows: TaskRow[] = assigned.map((t) => ({
        ...t,
        employeeName:
          nameByUserId.get(t.employee_id) || t.employee_id.slice(0, 8) + "…",
      }));
      setTasks(rows);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load assigned Office Admin tasks",
        variant: "destructive",
      });
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTasks = tasks.filter((t) =>
    statusFilter === "all" ? true : t.status === statusFilter,
  );
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const paginatedTasks = filteredTasks.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleStatusChange = async (
    taskId: string,
    newStatus: "pending" | "in_progress" | "completed",
  ) => {
    setUpdatingId(taskId);
    try {
      await onboardingService.updateOfficeAdminTask(taskId, {
        status: newStatus,
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      );
      toast({
        title: "Updated",
        description: "Task status updated.",
        variant: "success",
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update status",
        variant: "destructive",
      });
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
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Briefcase className="h-8 w-8 text-brand" />
            Office Admin Onboarding
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            See who has Office Admin tasks assigned and mark them in progress or
            completed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Office Admin tasks</CardTitle>
          <CardDescription>
            Tasks assigned to new hires from Onboarding Tracking. Change status
            as you work on them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {(["all", "pending", "in_progress", "completed"] as const).map(
              (status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className={
                    statusFilter === status
                      ? "bg-brand hover:bg-brand/90 text-white"
                      : ""
                  }
                >
                  {status === "all"
                    ? "All"
                    : status === "in_progress"
                      ? "In progress"
                      : status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ),
            )}
          </div>
          {filteredTasks.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6">
              {tasks.length === 0
                ? "No assigned Office Admin tasks yet. Assign templates to people from Onboarding Tracking."
                : `No tasks with status "${statusFilter === "all" ? "any" : statusFilter === "in_progress" ? "In progress" : statusFilter}".`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="text-left py-3 px-2 font-medium text-neutral-700 dark:text-neutral-300">
                      Employee
                    </th>
                    <th className="text-left py-3 px-2 font-medium text-neutral-700 dark:text-neutral-300">
                      Task
                    </th>
                    <th className="text-left py-3 px-2 font-medium text-neutral-700 dark:text-neutral-300">
                      Status
                    </th>
                    <th className="text-left py-3 px-2 font-medium text-neutral-700 dark:text-neutral-300">
                      Update
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTasks.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer"
                      onClick={() => setDetailTask(t)}
                    >
                      <td className="py-3 px-2 text-neutral-900 dark:text-white">
                        {t.employeeName}
                      </td>
                      <td className="py-3 px-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailTask(t);
                          }}
                          className="text-left font-medium text-brand hover:underline flex items-center gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                          {t.name}
                        </button>
                      </td>
                      <td
                        className="py-3 px-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className={`inline-block px-2 py-1 rounded-none text-xs font-medium ${
                            t.status === "completed"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : t.status === "in_progress"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                          }`}
                        >
                          {t.status === "in_progress"
                            ? "In progress"
                            : t.status === "completed"
                              ? "Completed"
                              : "Pending"}
                        </span>
                      </td>
                      <td
                        className="py-3 px-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {updatingId === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Select
                            value={t.status}
                            onChange={(e) =>
                              handleStatusChange(
                                t.id,
                                e.target.value as
                                  | "pending"
                                  | "in_progress"
                                  | "completed",
                              )
                            }
                            options={[
                              { value: "pending", label: "Pending" },
                              { value: "in_progress", label: "In progress" },
                              { value: "completed", label: "Completed" },
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
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                Page {page} of {totalPages} ({filteredTasks.length} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1} leftIcon={<ChevronLeft className="h-4 w-4" />}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages} rightIcon={<ChevronRight className="h-4 w-4" />}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!detailTask}
        onOpenChange={(open) => !open && setDetailTask(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-brand" />
              {detailTask?.name}
            </DialogTitle>
            <DialogDescription>
              For:{" "}
              <span className="font-medium text-neutral-900 dark:text-white">
                {detailTask?.employeeName}
              </span>
              {detailTask?.description && (
                <span className="block mt-2 text-neutral-600 dark:text-neutral-400">
                  {detailTask.description}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-4 pt-2 text-sm">
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  Type:
                </span>{" "}
                {detailTask.task_type.replace("_", " ")}
              </div>
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  Priority:
                </span>{" "}
                {detailTask.priority}
              </div>
              {detailTask.due_date && (
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    Due:
                  </span>{" "}
                  {detailTask.due_date}
                </div>
              )}
              {detailTask.notes && (
                <div>
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    Notes
                  </span>
                  <p className="mt-1 whitespace-pre-wrap rounded border border-neutral-200 dark:border-neutral-700 p-2 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                    {detailTask.notes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex items-center gap-2 flex-wrap">
            {detailTask && (
              <>
                <span className="text-sm text-neutral-500 mr-2">Status:</span>
                {updatingId === detailTask.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Select
                    value={detailTask.status}
                    onChange={(e) => {
                      const v = e.target.value as
                        | "pending"
                        | "in_progress"
                        | "completed";
                      handleStatusChange(detailTask.id, v);
                      setDetailTask((prev) =>
                        prev ? { ...prev, status: v } : null,
                      );
                    }}
                    options={[
                      { value: "pending", label: "Pending" },
                      { value: "in_progress", label: "In progress" },
                      { value: "completed", label: "Completed" },
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

export default OfficeAdminOnboarding;
