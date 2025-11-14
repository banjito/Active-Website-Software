import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'duplicate' | 'wontfix';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  reporter_id: string | null;
  page_url: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  resolved_at: string | null;
};

type IssueUpdate = {
  id: string;
  issue_id: string;
  updater_id: string | null;
  note: string | null;
  new_status: Issue['status'] | null;
  created_at: string;
};

type IssueAttachment = {
  id: string;
  issue_id: string;
  file_path: string;
  file_url: string | null;
  created_at: string;
};

type UserProfile = {
  id: string;
  email: string;
  full_name?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
};

const formatDuration = (startIso?: string | null, endIso?: string | null) => {
  if (!startIso) return '';
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  const mins = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const FeaturesFixesPage: React.FC = () => {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [updatesByIssue, setUpdatesByIssue] = useState<Record<string, IssueUpdate[]>>({});
  const [attachmentsByIssue, setAttachmentsByIssue] = useState<Record<string, IssueAttachment[]>>({});
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [search, setSearch] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedPriority, setEditedPriority] = useState<Issue['priority']>('normal');

  const loadData = async (showLoadingIndicator: boolean = true) => {
    if (showLoadingIndicator) {
      setLoading(true);
    }
    try {
      const q = supabase.schema('common').from('issue_reports').select('*').order('created_at', { ascending: false });
      const { data: rows, error } = await q;
      if (error) throw error;
      setIssues(rows as any);

      // If modal is open and NOT in edit mode, update the selected issue with fresh data
      // Don't update during edit mode to avoid overwriting user's changes
      if (selectedIssue && rows && !isEditMode) {
        const updatedIssue = (rows as Issue[]).find((r: Issue) => r.id === selectedIssue.id);
        if (updatedIssue) {
          setSelectedIssue(updatedIssue);
        }
      }

      // Fetch updates for visible issues in one go
      if (rows && rows.length) {
        const ids = rows.map((r: any) => r.id);
        
        // Fetch updates
        const { data: upRows, error: upErr } = await supabase
          .schema('common')
          .from('issue_updates')
          .select('*')
          .in('issue_id', ids)
          .order('created_at', { ascending: true });
        if (upErr) throw upErr;
        const grouped: Record<string, IssueUpdate[]> = {};
        (upRows || []).forEach(u => {
          if (!grouped[u.issue_id]) grouped[u.issue_id] = [];
          grouped[u.issue_id].push(u as any);
        });
        setUpdatesByIssue(grouped);

        // Fetch attachments
        const { data: attachRows, error: attachErr } = await supabase
          .schema('common')
          .from('issue_attachments')
          .select('*')
          .in('issue_id', ids)
          .order('created_at', { ascending: true });
        if (attachErr) throw attachErr;
        const groupedAttach: Record<string, IssueAttachment[]> = {};
        (attachRows || []).forEach((a: any) => {
          if (!groupedAttach[a.issue_id]) groupedAttach[a.issue_id] = [];
          groupedAttach[a.issue_id].push(a as any);
        });
        setAttachmentsByIssue(groupedAttach);

        // Fetch user profiles for reporters using RPC function
        const reporterIds = [...new Set(rows.map((r: any) => r.reporter_id).filter(Boolean))];
        if (reporterIds.length > 0) {
          const profiles: Record<string, UserProfile> = {};
          
          // Fetch each user's metadata using the RPC function
          await Promise.all(
            reporterIds.map(async (userId) => {
              try {
                const { data: metaData, error: metaError } = await supabase
                  .schema('common')
                  .rpc('get_user_metadata', { p_user_id: userId });
                
                if (!metaError && metaData) {
                  profiles[userId] = {
                    id: userId,
                    email: metaData.email || '',
                    full_name: metaData.name || metaData.full_name,
                    user_metadata: {
                      full_name: metaData.full_name,
                      name: metaData.name
                    }
                  };
                }
              } catch (err) {
                console.error(`Failed to fetch user metadata for ${userId}:`, err);
              }
            })
          );
          
          setUserProfiles(profiles);
        }
      }
    } catch (e) {
      console.error('Failed to load issues:', e);
    } finally {
      if (showLoadingIndicator) {
        setLoading(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    loadData(true);
  }, []);

  // Background refresh every 30 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadData(false); // Silent background refresh
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  const filtered = useMemo(() => {
    let list = issues;
    if (statusFilter === 'open') {
      // Include both 'open' and 'in_progress' in the open filter
      list = list.filter(i => i.status === 'open' || i.status === 'in_progress');
    } else if (statusFilter === 'resolved') {
      // Treat both 'resolved' and 'closed' as resolved in the view
      list = list.filter(i => i.status === 'resolved' || i.status === 'closed');
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(i => i.title.toLowerCase().includes(s) || (i.description || '').toLowerCase().includes(s));
    }
    return list;
  }, [issues, statusFilter, search]);

  const isAdmin = (user?.user_metadata?.role || '') === 'Admin';
  const isJohn = (user?.email || '').toLowerCase() === 'john.chambers@ampqes.com';

  const updateIssue = async (id: string, patch: Partial<Issue>) => {
    const { data, error } = await supabase
      .schema('common')
      .from('issue_reports')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    setIssues(prev => prev.map(i => (i.id === id ? { ...i, ...data } : i)));
  };

  const handlePriorityChange = async (issue: Issue, value: Issue['priority']) => {
    try {
      await updateIssue(issue.id, { priority: value });
    } catch (e) {
      console.error('Failed to change priority', e);
      alert('Failed to change priority');
    }
  };

  const handleMarkInProgress = async (issue: Issue) => {
    try {
      await updateIssue(issue.id, { 
        status: 'in_progress',
        started_at: new Date().toISOString()
      });
    } catch (e: any) {
      console.error('Failed to mark in progress', e);
      alert(e?.message || 'Failed to mark in progress');
    }
  };

  const handleMarkResolved = async (issue: Issue) => {
    try {
      await updateIssue(issue.id, { 
        status: 'resolved',
        resolved_at: new Date().toISOString()
      });
    } catch (e: any) {
      console.error('Failed to mark resolved', e);
      alert(e?.message || 'Failed to mark resolved');
    }
  };

  const getReporterName = (reporterId: string | null): string => {
    if (!reporterId) return 'Unknown';
    const profile = userProfiles[reporterId];
    if (!profile) return 'Unknown';
    return profile.full_name || profile.email || 'Unknown';
  };

  const handleIssueClick = (issue: Issue) => {
    setSelectedIssue(issue);
    setEditedTitle(issue.title);
    setEditedDescription(issue.description || '');
    setEditedPriority(issue.priority);
    setIsEditMode(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedIssue(null);
    setIsEditMode(false);
  };

  const handleStartEdit = () => {
    if (selectedIssue) {
      setEditedTitle(selectedIssue.title);
      setEditedDescription(selectedIssue.description || '');
      setEditedPriority(selectedIssue.priority);
      setIsEditMode(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    if (selectedIssue) {
      setEditedTitle(selectedIssue.title);
      setEditedDescription(selectedIssue.description || '');
      setEditedPriority(selectedIssue.priority);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedIssue) return;
    
    try {
      await updateIssue(selectedIssue.id, {
        title: editedTitle.trim(),
        description: editedDescription.trim(),
        priority: editedPriority
      });
      setIsEditMode(false);
    } catch (e: any) {
      console.error('Failed to update issue', e);
      alert(e?.message || 'Failed to update issue');
    }
  };

  return (
    <div className="p-6 flex justify-center">
      <div className="max-w-7xl w-full space-y-6">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Features & Fixes</h1>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="form-select w-40"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="form-input w-64"
            />
          </div>
        </div>

        <section className="bg-white dark:bg-dark-150 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4">
          {loading ? (
            <div className="text-gray-500 dark:text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400">No issues found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Title</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(issue => {
                    return (
                      <tr key={issue.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-dark-100">
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleIssueClick(issue)}
                            className="text-left w-full"
                          >
                            <div className="font-medium text-[#f26722] hover:text-[#e55611] cursor-pointer">{issue.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[600px]">{issue.description}</div>
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{issue.status}</span>
                        </td>
                        <td className="py-3 px-4">
                          {(isAdmin || user?.id === issue.reporter_id) ? (
                            <select
                              value={issue.priority}
                              onChange={(e) => handlePriorityChange(issue, e.target.value as Issue['priority'])}
                              className="form-select w-32 text-sm"
                            >
                              <option value="low">Low</option>
                              <option value="normal">Normal</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          ) : (
                            <span className="text-sm text-gray-700 dark:text-gray-300 inline-block min-w-[80px]">{issue.priority}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Issue Details Modal */}
        {showModal && selectedIssue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Overlay */}
            <div 
              className="fixed inset-0 bg-black opacity-50"
              onClick={closeModal}
            ></div>
            
            {/* Modal Content */}
            <div className="relative bg-white dark:bg-dark-150 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto z-50">
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-dark-150 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 pr-4">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="text-2xl font-bold text-gray-900 dark:text-white w-full bg-white dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
                        placeholder="Issue title"
                      />
                    ) : (
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {selectedIssue.title}
                      </h2>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {user?.id === selectedIssue.reporter_id && !isEditMode && (
                      <button
                        onClick={handleStartEdit}
                        className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                      >
                        Edit
                      </button>
                    )}
                    {isEditMode && (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-md"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      onClick={closeModal}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Status:</span>
                    <div className="text-gray-900 dark:text-white mt-1">{selectedIssue.status}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Priority:</span>
                    {isEditMode ? (
                      <select
                        value={editedPriority}
                        onChange={(e) => setEditedPriority(e.target.value as Issue['priority'])}
                        className="form-select w-full mt-1 text-sm"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    ) : (
                      <div className="text-gray-900 dark:text-white mt-1">{selectedIssue.priority}</div>
                    )}
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Reporter:</span>
                    <div className="text-gray-900 dark:text-white mt-1">{getReporterName(selectedIssue.reporter_id)}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Duration:</span>
                    <div className="text-gray-900 dark:text-white mt-1">
                      {formatDuration(selectedIssue.created_at, selectedIssue.resolved_at) || '-'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-3">
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Reported:</span>
                    <div className="text-gray-900 dark:text-white mt-1">
                      {new Date(selectedIssue.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Started:</span>
                    <div className="text-gray-900 dark:text-white mt-1">
                      {selectedIssue.started_at ? new Date(selectedIssue.started_at).toLocaleString() : '-'}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Resolved:</span>
                    <div className="text-gray-900 dark:text-white mt-1">
                      {selectedIssue.resolved_at ? new Date(selectedIssue.resolved_at).toLocaleString() : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-4 space-y-6">
                {/* Description */}
                {(selectedIssue.description || isEditMode) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Description
                    </h3>
                    {isEditMode ? (
                      <textarea
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        rows={6}
                        className="form-textarea w-full text-gray-900 dark:text-white bg-white dark:bg-dark-100 border border-gray-300 dark:border-gray-600 rounded px-3 py-2"
                        placeholder="Describe the issue..."
                      />
                    ) : (
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {selectedIssue.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Page URL */}
                {selectedIssue.page_url && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Reported From
                    </h3>
                    <a 
                      href={selectedIssue.page_url}
                      className="text-[#f26722] hover:text-[#e55611] break-all underline"
                    >
                      {selectedIssue.page_url}
                    </a>
                  </div>
                )}

                {/* Attachments */}
                {attachmentsByIssue[selectedIssue.id] && attachmentsByIssue[selectedIssue.id].length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Attachments
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {attachmentsByIssue[selectedIssue.id].map(attachment => {
                        const isImage = attachment.file_path.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                        return (
                          <div key={attachment.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            {attachment.file_url && isImage ? (
                              <a href={attachment.file_url} target="_blank" rel="noreferrer" className="block">
                                <img 
                                  src={attachment.file_url} 
                                  alt="Issue attachment"
                                  className="w-full h-48 object-contain bg-gray-50 dark:bg-dark-100 hover:opacity-90 transition-opacity"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `
                                        <div class="w-full h-48 bg-gray-100 dark:bg-dark-100 flex items-center justify-center">
                                          <div class="text-center p-4">
                                            <p class="text-gray-500 dark:text-gray-400 text-sm">Image failed to load</p>
                                            <a href="${attachment.file_url}" target="_blank" class="text-[#f26722] hover:text-[#e55611] text-xs underline mt-2 block">Open directly</a>
                                          </div>
                                        </div>
                                      `;
                                    }
                                  }}
                                />
                              </a>
                            ) : attachment.file_url ? (
                              <a 
                                href={attachment.file_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="w-full h-48 bg-gray-100 dark:bg-dark-100 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-dark-200 transition-colors"
                              >
                                <div className="text-center p-4">
                                  <svg className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">File Attachment</p>
                                  <p className="text-[#f26722] hover:text-[#e55611] text-xs underline mt-1">Click to open</p>
                                </div>
                              </a>
                            ) : (
                              <div className="w-full h-48 bg-gray-100 dark:bg-dark-100 flex items-center justify-center">
                                <span className="text-gray-500 dark:text-gray-400">
                                  No preview available
                                </span>
                              </div>
                            )}
                            <div className="p-3 bg-gray-50 dark:bg-dark-200">
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={attachment.file_path}>
                                {attachment.file_path.split('/').pop()}
                              </p>
                              {attachment.file_url && (
                                <a 
                                  href={attachment.file_url} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-xs text-[#f26722] hover:text-[#e55611] underline mt-1 block"
                                >
                                  Open file
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Timeline
                  </h3>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-white">Created</span>
                      <span className="text-gray-500 dark:text-gray-400"> — {new Date(selectedIssue.created_at).toLocaleString()}</span>
                    </div>
                    {selectedIssue.started_at && (
                      <div className="text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">Started</span>
                        <span className="text-gray-500 dark:text-gray-400"> — {new Date(selectedIssue.started_at).toLocaleString()}</span>
                        <span className="text-gray-500 dark:text-gray-400"> (time to start: {formatDuration(selectedIssue.created_at, selectedIssue.started_at)})</span>
                      </div>
                    )}
                    {updatesByIssue[selectedIssue.id] && updatesByIssue[selectedIssue.id].map(update => (
                      <div key={update.id} className="text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {update.new_status ? `Status → ${update.new_status}` : 'Note'}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400"> — {new Date(update.created_at).toLocaleString()}</span>
                        {update.note && (
                          <div className="mt-1 text-gray-700 dark:text-gray-300 ml-4">
                            {update.note}
                          </div>
                        )}
                      </div>
                    ))}
                    {selectedIssue.resolved_at && (
                      <div className="text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">Resolved</span>
                        <span className="text-gray-500 dark:text-gray-400"> — {new Date(selectedIssue.resolved_at).toLocaleString()}</span>
                        {selectedIssue.started_at ? (
                          <>
                            <span className="text-gray-500 dark:text-gray-400"> (time to complete: {formatDuration(selectedIssue.started_at, selectedIssue.resolved_at)})</span>
                            <div className="mt-1 text-gray-500 dark:text-gray-400 ml-4">
                              Total time: {formatDuration(selectedIssue.created_at, selectedIssue.resolved_at)}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400"> (total time: {formatDuration(selectedIssue.created_at, selectedIssue.resolved_at)})</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-gray-50 dark:bg-dark-100 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
                <div className="flex gap-2">
                  {isJohn && selectedIssue.status === 'open' && (
                    <button
                      onClick={() => {
                        handleMarkInProgress(selectedIssue);
                        closeModal();
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
                    >
                      Mark In Progress
                    </button>
                  )}
                  {isJohn && (selectedIssue.status === 'in_progress' || selectedIssue.status === 'open') && selectedIssue.status !== 'resolved' && selectedIssue.status !== 'closed' && (
                    <button
                      onClick={() => {
                        handleMarkResolved(selectedIssue);
                        closeModal();
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-200 dark:bg-dark-200 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-dark-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeaturesFixesPage;


