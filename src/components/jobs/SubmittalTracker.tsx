import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  file_url: string;
  created_at: string;
  status?: 'not started' | 'in_progress' | 'ready_for_review' | 'approved' | 'sent' | 'issue' | 'archived';
  approved_at?: string | null;
  sent_at?: string | null;
}

interface SubmittalTrackerProps {
  submittalJobType: 'standard' | 'data_center' | null | undefined;
  submittalWindowHours: number | null | undefined;
  assets: Asset[];
}

interface ReportStatus {
  assetId: string;
  assetName: string;
  approvedAt: Date | null;
  sentAt: Date | null;
  isOnTime: boolean;
  isLate: boolean;
  isPending: boolean;
  hoursElapsed: number | null;
  windowHours: number;
}

export const SubmittalTracker: React.FC<SubmittalTrackerProps> = ({
  submittalJobType,
  submittalWindowHours,
  assets
}) => {
  const [reportStatuses, setReportStatuses] = useState<ReportStatus[]>([]);
  const [onTimePercentage, setOnTimePercentage] = useState<number>(0);
  const [totalReports, setTotalReports] = useState<number>(0);
  const [onTimeCount, setOnTimeCount] = useState<number>(0);
  const [lateCount, setLateCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Determine the submittal window in hours
  const getWindowHours = (): number => {
    if (submittalWindowHours) return submittalWindowHours;
    if (submittalJobType === 'data_center') return 72; // Default 72 hours for data center
    return 168; // Default 7 days (168 hours) for standard
  };

  // Listen for asset status changes to refresh the tracker
  useEffect(() => {
    const handleAssetStatusChanged = () => {
      console.log('[SubmittalTracker] Asset status changed, refreshing...');
      setRefreshKey(prev => prev + 1);
    };

    window.addEventListener('assetStatusChanged', handleAssetStatusChanged);
    return () => {
      window.removeEventListener('assetStatusChanged', handleAssetStatusChanged);
    };
  }, []);

  useEffect(() => {
    const windowHours = getWindowHours();
    const statuses: ReportStatus[] = [];
    let onTime = 0;
    let late = 0;
    let pending = 0;

    // Filter assets that are reports (have file_url starting with 'report:') and exclude archived
    const reportAssets = assets.filter(asset => 
      asset.file_url?.startsWith('report:') && 
      asset.status !== 'archived'
    );

    reportAssets.forEach(asset => {
      const approvedAt = asset.approved_at ? new Date(asset.approved_at) : null;
      const sentAt = asset.sent_at ? new Date(asset.sent_at) : null;

      let hoursElapsed: number | null = null;
      let isOnTime = false;
      let isLate = false;
      let isPending = false;

      if (approvedAt && sentAt) {
        // Both timestamps exist - calculate the elapsed time
        hoursElapsed = (sentAt.getTime() - approvedAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursElapsed <= windowHours) {
          isOnTime = true;
          onTime++;
        } else {
          isLate = true;
          late++;
        }
      } else if (approvedAt && !sentAt) {
        // Approved but not sent yet - check if it's late or still pending
        const now = new Date();
        hoursElapsed = (now.getTime() - approvedAt.getTime()) / (1000 * 60 * 60);
        
        // If already exceeded window, it's late even though not sent yet
        if (hoursElapsed > windowHours) {
          isLate = true;
          late++;
        } else {
          // Still within window, so pending
          isPending = true;
          pending++;
        }
      } else if (!approvedAt && (asset.status === 'sent')) {
        // Sent without approval timestamp - this shouldn't happen but handle it
        // Treat as on-time with zero hours elapsed
        hoursElapsed = 0;
        isOnTime = true;
        onTime++;
      } else {
        // Not approved yet - pending
        isPending = true;
        pending++;
      }

      statuses.push({
        assetId: asset.id,
        assetName: asset.name,
        approvedAt,
        sentAt,
        isOnTime,
        isLate,
        isPending,
        hoursElapsed,
        windowHours
      });
    });

    setReportStatuses(statuses);
    setTotalReports(statuses.length);
    setOnTimeCount(onTime);
    setLateCount(late);
    setPendingCount(pending);

    // Calculate percentage based on completed reports (on time + late)
    const completedReports = onTime + late;
    if (completedReports > 0) {
      setOnTimePercentage(Math.round((onTime / completedReports) * 100));
    } else {
      setOnTimePercentage(0);
    }
  }, [assets, submittalWindowHours, submittalJobType, refreshKey]);

  const windowHours = getWindowHours();
  const windowDays = windowHours / 24;

  // If there are no reports, don't show the tracker
  if (totalReports === 0) {
    return null;
  }

  // Determine the color based on percentage
  const getPercentageColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-green-600 dark:text-green-400';
    if (percentage >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getJobTypeLabel = (): string => {
    if (submittalJobType === 'data_center') return 'Data Center';
    return 'Standard';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Remote Submittal Tracking
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {getJobTypeLabel()} • {windowDays} day window
          </p>
        </div>
      </div>

      {/* KPI Card - Prominent */}
      <div className="bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
              On-Time Delivery
            </p>
            <p className={`text-5xl font-bold ${getPercentageColor(onTimePercentage)}`}>
              {onTimePercentage}%
            </p>
          </div>
          <div className="flex items-center gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {onTimeCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">On Time</p>
            </div>
            <div className="w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
            <div>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {lateCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Late</p>
            </div>
            <div className="w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
            <div>
              <p className="text-3xl font-bold text-gray-600 dark:text-gray-400">
                {pendingCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pending</p>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {onTimeCount + lateCount > 0 ? (
              <>{onTimeCount} of {onTimeCount + lateCount} completed reports sent within timeline</>
            ) : (
              <>No completed reports yet</>
            )}
          </p>
        </div>
      </div>

      {/* Report List - Minimal */}
      {reportStatuses.length > 0 && (
        <div className="bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">
              Report Status
            </h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {reportStatuses.map((status) => (
              <div
                key={status.assetId}
                className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-dark-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {status.isOnTime && (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    )}
                    {status.isLate && (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    )}
                    {status.isPending && (
                      <Clock className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {status.assetName}
                      </p>
                      {status.hoursElapsed !== null && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {Math.round(status.hoursElapsed)}h elapsed
                          {status.sentAt && (
                            <> • Sent {status.sentAt.toLocaleDateString()}</>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    {status.isOnTime && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        On Time
                      </span>
                    )}
                    {status.isLate && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        Late
                      </span>
                    )}
                    {status.isPending && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

