import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { MessageCircle, X, AlertCircle, Clock, User } from 'lucide-react';
import { format } from 'date-fns';

interface AssetCommentsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  assetName: string;
}

interface ReportComment {
  id: string;
  title: string;
  review_comments: string;
  reviewed_by: string;
  reviewed_at: string;
  status: string;
  report_type: string;
}

export const AssetCommentsDialog: React.FC<AssetCommentsDialogProps> = ({
  isOpen,
  onClose,
  assetId,
  assetName
}) => {
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && assetId) {
      fetchAssetComments();
    }
  }, [isOpen, assetId]);

  const fetchAssetComments = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get technical reports linked to this asset that have review comments
      const { data: reportLinks, error: linkError } = await supabase
        .schema('neta_ops')
        .from('asset_reports')
        .select('report_id')
        .eq('asset_id', assetId);

      if (linkError) {
        throw linkError;
      }

      if (!reportLinks || reportLinks.length === 0) {
        setComments([]);
        return;
      }

      const reportIds = reportLinks.map(link => link.report_id);

      // Fetch technical reports with review comments
      const { data: reportsData, error: reportsError } = await supabase
        .schema('neta_ops')
        .from('technical_reports')
        .select('id, title, review_comments, reviewed_by, reviewed_at, status, report_type')
        .in('id', reportIds)
        .not('review_comments', 'is', null)
        .neq('review_comments', '')
        .order('reviewed_at', { ascending: false });

      if (reportsError) {
        throw reportsError;
      }

      setComments(reportsData || []);
    } catch (error: any) {
      console.error('Error fetching asset comments:', error);
      setError(`Failed to load comments: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-green-600 dark:text-green-400';
      case 'rejected':
        return 'text-red-600 dark:text-red-400';
      case 'in-review':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return '✅';
      case 'rejected':
        return '❌';
      case 'in-review':
        return '👀';
      default:
        return '📝';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-dark-150 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <MessageCircle className="h-5 w-5 text-[#f26722] mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Review Comments
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Asset Info */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-dark-200 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Asset:</span> {assetName}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#f26722]"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading comments...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-600 dark:text-red-400">{error}</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageCircle className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-3" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                No Review Comments
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                This asset doesn't have any review comments yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-dark-100"
                >
                  {/* Comment Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIcon(comment.status)}</span>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {comment.title}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {comment.report_type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                      <div className={`font-medium ${getStatusColor(comment.status)}`}>
                        {comment.status.charAt(0).toUpperCase() + comment.status.slice(1)}
                      </div>
                      {comment.reviewed_at && (
                        <div className="flex items-center mt-1">
                          <Clock className="h-3 w-3 mr-1" />
                          {format(new Date(comment.reviewed_at), 'MMM d, yyyy HH:mm')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comment Content */}
                  <div className="bg-white dark:bg-dark-150 rounded-md p-3 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                          {comment.review_comments}
                        </p>
                        {comment.reviewed_by && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Reviewed by: {comment.reviewed_by}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-200">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              className="text-gray-700 dark:text-gray-300"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
