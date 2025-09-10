import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import Card from "../../components/ui/Card"
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/Card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/Tabs"
import { Badge } from "../../components/ui"
import { ChevronRight, Building, MapPin, Bell, User as UserIcon, Settings, LogOut, FileText, Eye, Shield, ChevronDown, ChevronUp } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useAuth } from "../../lib/AuthContext"
import { useDivision } from '../../App'
import { ThemeToggle } from '../../components/theme/theme-toggle'
import { SettingsPopup } from '../../components/ui/SettingsPopup'
import { ProfileView } from "@/components/profile/ProfileView"
import { AboutPopup } from "@/components/ui/AboutPopup"
import { WelcomePopup } from "@/components/ui/WelcomePopup"
import { usePermissions } from '@/hooks/usePermissions'
import { Portal } from '@/lib/roles'
import { ChatButton } from '@/components/chat/ChatButton'
import { ShortcutDisplay } from '@/components/shortcuts/ShortcutDisplay'
import { ReviewShortcuts } from '@/components/shortcuts/ReviewShortcuts'
import { supabase } from "@/lib/supabase"

type ReviewNotification = {
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  assetId: string;
  assetName: string;
  createdAt: string;
  status?: 'ready_for_review' | 'approved' | 'issue';
};

type NotificationSummary = {
  status: 'ready_for_review' | 'issue' | 'approved';
  jobCount: number;
  reportCount: number;
};

type JobGroup = {
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  count: number;
  oldest: string;
};

// Hidden jobs (dev aid) key
const HIDDEN_NOTIF_JOB_IDS_KEY = 'hiddenNotificationJobIds';
const NOTIF_LAST_SEEN_KEY = 'notifLastSeenByStatus';

type StatusKey = 'ready_for_review' | 'issue' | 'approved';

export default function PortalLanding() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const [showPopup, setShowPopup] = useState(false);
  const [popupContent, setPopupContent] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<ReviewNotification[]>([]);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary[]>([]);
  const [detailStatus, setDetailStatus] = useState<NotificationSummary['status'] | null>(null);
  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showReviewShortcuts, setShowReviewShortcuts] = useState(false);
  const [defaultToShow, setDefaultToShow] = useState(false);
  const [defaultToShowReview, setDefaultToShowReview] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { setDivision } = useDivision();
  const { isAdmin, checkPortalAccess } = usePermissions();
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Record<StatusKey, string>>({ ready_for_review: '', issue: '', approved: '' });
  const [unseenCounts, setUnseenCounts] = useState<Record<StatusKey, number>>({ ready_for_review: 0, issue: 0, approved: 0 });
  const rtDebounceRef = useRef<number | null>(null);

  // Initialize preferences from localStorage
  useEffect(() => {
    const savedDefaultPreference = localStorage.getItem('defaultToShowShortcuts');
    const savedDefaultReviewPreference = localStorage.getItem('defaultToShowReviewShortcuts');
    
    // Determine the default behavior values
    const defaultBehavior = savedDefaultPreference === 'true';
    const defaultReviewBehavior = savedDefaultReviewPreference === 'true';
    
    // Set default behavior preferences
    setDefaultToShow(defaultBehavior);
    setDefaultToShowReview(defaultReviewBehavior);
    
    // Always use the default behavior on page load/refresh
    // This means the toggle controls what happens on refresh
    setShowShortcuts(defaultBehavior);
    setShowReviewShortcuts(defaultReviewBehavior);
    
    // Mark as initialized to prevent saving on initial load
    setIsInitialized(true);
  }, []);

  // Don't save showShortcuts to localStorage - let the default toggle control refresh behavior
  // The manual show/hide is only for the current session

  // Save defaultToShow preference to localStorage when it changes (but not on initial load)
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('defaultToShowShortcuts', defaultToShow.toString());
    }
  }, [defaultToShow, isInitialized]);

  // Save defaultToShowReview preference to localStorage when it changes (but not on initial load)
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('defaultToShowReviewShortcuts', defaultToShowReview.toString());
    }
  }, [defaultToShowReview, isInitialized]);

  useEffect(() => {
    const division = searchParams.get('division');
    if (division) {
      // Set the active tab based on the division
      if (['north_alabama', 'tennessee', 'georgia', 'international'].includes(division)) {
        setActiveTab("tech");
      } else if (['calibration', 'armadillo', 'scavenger'].includes(division)) {
        setActiveTab("tech");
      } else if (['office_admin', 'sales', 'engineering'].includes(division)) {
        setActiveTab("admin");
      }
    }
  }, [searchParams]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuRef, notificationsRef]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      window.location.href = '/login';
    } catch (error) {
      console.error('Error signing out:', error);
      window.location.href = '/login';
    } finally {
      setIsSigningOut(false);
    }
  };

  const handlePortalClick = (portalName: string, url?: string) => {
    // Map portal names to their corresponding portal types
    const portalMap: Record<string, Portal> = {
      "Sales Portal": "sales",
      "NETA Portal": "neta",
      "Lab Portal": "lab",
      "HR Portal": "hr",
      "Office Admins Portal": "office",
      "Engineering Portal": "engineering",
      "Scavenger Portal": "scavenger" // Scavenger portal has its own portal type
    };

    // Map portal names to their URLs if not provided
    const portalUrls: Record<string, string> = {
      "Sales Portal": "/sales-dashboard",
      "NETA Portal": "/neta",
      "Lab Portal": "/lab",
      "HR Portal": "/hr",
      "Office Admins Portal": "/office",
      "Engineering Portal": "/engineering", // Updated to use the new engineering page
      "Scavenger Portal": "/scavenger"
    };

    const portalType = portalMap[portalName];
    if (portalType && !checkPortalAccess(portalType)) {
      setPopupContent("Your current role does not have access to this portal. Please request an updated role and await admin approval.");
      setShowPopup(true);
      return;
    }

    // Update the division based on which portal is clicked
    if (portalName === "Engineering Portal") {
      setDivision("engineering");
    } else if (portalName === "Sales Portal") {
      setDivision("sales");
    } else if (portalName === "Lab Portal") {
      setDivision("lab");
    } else if (portalType) {
      setDivision(portalType);
    }

    // Navigate to the selected portal
    if (url) {
      if (url.startsWith('http')) {
        window.location.href = url;
      } else {
        navigate(url);
      }
    } else if (portalUrls[portalName]) {
      navigate(portalUrls[portalName]);
    } else {
      setPopupContent(`${portalName} is currently in development`);
      setShowPopup(true);
    }
  };

  const handleDivisionClick = (division: string) => {
    try {
      console.log('handleDivisionClick called with division:', division);
      
      // Map divisions to their corresponding portal types
      const divisionMap: Record<string, Portal> = {
        'north_alabama': 'neta',
        'tennessee': 'neta',
        'georgia': 'neta',
        'international': 'neta',
        'calibration': 'lab',
        'armadillo': 'lab',
        'scavenger': 'scavenger',
        'office_admin': 'office',
        'sales': 'sales',
        'engineering': 'engineering'
      };

      const portalType = divisionMap[division];
      if (portalType && !checkPortalAccess(portalType)) {
        setPopupContent("Your current role does not have access to this portal. Please request an updated role and await admin approval.");
        setShowPopup(true);
        return;
      }
      
      // Set the division in context
      setDivision(division);
      console.log('Division set in context');
      
      // Verify the division was set
      const savedDivision = localStorage.getItem('selectedDivision');
      console.log('Verified division in localStorage:', savedDivision);
      
      // Calibration division should route to external AMP Cal site
      if (division === 'calibration') {
        window.location.href = 'https://ampcalos.io';
        return;
      }

      const targetPath = `/${division}/dashboard`;
      console.log('Navigating to:', targetPath);
      navigate(targetPath);
    } catch (error) {
      console.error('Error in handleDivisionClick:', error);
      setPopupContent("Your current role does not have access to this portal. Please request an updated role and await admin approval.");
      setShowPopup(true);
    }
  };

  const handleOtherPortalClick = (path: string) => {
    setDivision(null);
    navigate(path);
  };

  const handleViewProfile = () => {
    setIsProfileMenuOpen(false);
    setIsProfileViewOpen(true);
  };

  const handleSettings = () => {
    setIsProfileMenuOpen(false);
    setSettingsMenuOpen(true);
  };

  const handleAbout = () => {
    setIsProfileMenuOpen(false);
    setIsAboutOpen(true);
  };
  
  const handleWelcome = () => {
    setIsWelcomeOpen(true);
  };

  // Handle backdrop click for the generic popup
  const handleGenericPopupBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if the click is directly on the backdrop itself
    if (e.target === e.currentTarget) {
      setShowPopup(false);
    }
  };

  // Toggle shortcuts visibility
  const toggleShortcuts = () => {
    setShowShortcuts(prev => !prev);
  };

  // Toggle default shortcuts behavior
  const toggleDefaultBehavior = () => {
    setDefaultToShow(prev => !prev);
  };

  // Toggle review shortcuts visibility
  const toggleReviewShortcuts = () => {
    setShowReviewShortcuts(prev => !prev);
  };

  // Toggle default review shortcuts behavior
  const toggleDefaultReviewBehavior = () => {
    setDefaultToShowReview(prev => !prev);
  };

  // helper to fetch assets by status and produce job groups
  const fetchAssetsByStatus = async (status: 'ready_for_review' | 'approved' | 'issue') => {
    const { data: assetsData, error: assetsError } = await supabase
      .schema('neta_ops')
      .from('assets')
      .select('id, name, created_at, status')
      .eq('status', status)
      .order('created_at', { ascending: true });
    if (assetsError) throw assetsError;
    if (!assetsData || assetsData.length === 0) return { assets: [], groups: [] as JobGroup[] };

    const assetIds = assetsData.map(a => a.id);
    const { data: links, error: linksError } = await supabase
      .schema('neta_ops')
      .from('job_assets')
      .select('job_id, asset_id')
      .in('asset_id', assetIds);
    if (linksError) throw linksError;
    if (!links || links.length === 0) return { assets: [], groups: [] as JobGroup[] };

    const jobIdByAsset: Record<string, string> = {};
    links.forEach(l => { jobIdByAsset[l.asset_id] = l.job_id; });
    const jobIds = Array.from(new Set(links.map(l => l.job_id)));

    const { data: jobs, error: jobsError } = await supabase
      .schema('neta_ops')
      .from('jobs')
      .select('id, title, job_number, deleted_at')
      .in('id', jobIds);
    if (jobsError) throw jobsError;
    const jobById: Record<string, { id: string; title: string; job_number?: string; deleted_at?: string | null; }> = {};
    (jobs || []).forEach(j => { jobById[j.id] = j; });

    // group counts per job (skip deleted and hidden)
    const groupMap: Record<string, JobGroup> = {};
    assetsData.forEach(a => {
      const jid = jobIdByAsset[a.id];
      if (!jid) return;
      const jb = jobById[jid];
      if (!jb) return;
      if (jb.deleted_at) return; // filter deleted jobs
      if (hiddenJobIds.has(jid)) return; // filter hidden jobs
      if (!groupMap[jid]) {
        groupMap[jid] = {
          jobId: jid,
          jobTitle: jb?.title || 'Job',
          jobNumber: jb?.job_number,
          count: 0,
          oldest: a.created_at,
        };
      }
      groupMap[jid].count += 1;
      if (new Date(a.created_at) < new Date(groupMap[jid].oldest)) {
        groupMap[jid].oldest = a.created_at;
      }
    });

    const groups: JobGroup[] = Object.values(groupMap).sort((a, b) => new Date(a.oldest).getTime() - new Date(b.oldest).getTime());

    const assets: ReviewNotification[] = assetsData
      .filter(a => {
        const jid = jobIdByAsset[a.id];
        const jb = jobById[jid];
        return jb && !jb.deleted_at && !hiddenJobIds.has(jid);
      })
      .map(a => ({
        jobId: jobIdByAsset[a.id],
        jobTitle: jobById[jobIdByAsset[a.id]]?.title || 'Job',
        jobNumber: jobById[jobIdByAsset[a.id]]?.job_number,
        assetId: a.id,
        assetName: a.name,
        createdAt: a.created_at,
        status: status,
      }));

    return { assets, groups };
  };

  // Load lastSeen from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_LAST_SEEN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<StatusKey, string>>;
        setLastSeen(prev => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  const persistLastSeen = (map: Record<StatusKey, string>) => {
    try { localStorage.setItem(NOTIF_LAST_SEEN_KEY, JSON.stringify(map)); } catch {}
  };

  // helper to compute max createdAt
  const getMaxCreatedAt = (assets: ReviewNotification[]): string => {
    if (assets.length === 0) return '';
    return assets.reduce((max, a) => (new Date(a.createdAt) > new Date(max) ? a.createdAt : max), assets[0].createdAt);
  };

  // Load summary (also compute unseen counts)
  const loadNotificationSummary = async () => {
    if (!user) return;
    try {
      setNotifLoading(true);
      const statuses: StatusKey[] = ['ready_for_review', 'issue', 'approved'];
      const summary: NotificationSummary[] = [];
      const unseen: Record<StatusKey, number> = { ready_for_review: 0, issue: 0, approved: 0 };

      for (const s of statuses) {
        const { assets, groups } = await fetchAssetsByStatus(s);
        summary.push({ status: s, jobCount: groups.length, reportCount: assets.length });
        const ls = lastSeen[s] ? new Date(lastSeen[s]).getTime() : 0;
        const countNew = assets.filter(a => new Date(a.createdAt).getTime() > ls).length;
        unseen[s] = countNew;
      }
      setNotificationSummary(summary);
      setUnseenCounts(unseen);
      setDetailStatus(null);
      setJobGroups([]);
      setNotifications([]);
    } catch (err) {
      console.error('Failed to load notification summary:', err);
      setNotificationSummary([
        { status: 'ready_for_review', jobCount: 0, reportCount: 0 },
        { status: 'issue', jobCount: 0, reportCount: 0 },
        { status: 'approved', jobCount: 0, reportCount: 0 },
      ]);
    } finally {
      setNotifLoading(false);
    }
  };

  // Poll the summary periodically to detect new items
  useEffect(() => {
    // initial load
    void loadNotificationSummary();
    const id = setInterval(() => { void loadNotificationSummary(); }, 60000); // 60s
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hiddenJobIds]);

  // Listen for asset status changes to refresh notifications
  useEffect(() => {
    const handleAssetStatusChange = (event: CustomEvent) => {
      const { newStatus } = event.detail;
      // Only refresh if the status change affects ready_for_review
      if (newStatus === 'ready_for_review' || newStatus === 'in_progress') {
        console.log('Asset status changed, refreshing portal notifications');
        void loadNotificationSummary();
      }
    };

    window.addEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    
    return () => {
      window.removeEventListener('assetStatusChanged', handleAssetStatusChange as EventListener);
    };
  }, []);

  const markStatusSeen = (status: StatusKey, assets: ReviewNotification[]) => {
    const latest = getMaxCreatedAt(assets);
    if (!latest) return;
    setLastSeen(prev => {
      const next = { ...prev, [status]: latest };
      persistLastSeen(next);
      return next;
    });
    setUnseenCounts(prev => ({ ...prev, [status]: 0 }));
  };

  const loadDetailForStatus = async (status: NotificationSummary['status']) => {
    if (!user) return;
    try {
      setNotifLoading(true);
      const { assets, groups } = await fetchAssetsByStatus(status);
      setNotifications(assets);
      setJobGroups(groups);
      setDetailStatus(status);
    } catch (err) {
      console.error('Failed to load notification details:', err);
      setNotifications([]);
      setJobGroups([]);
    } finally {
      setNotifLoading(false);
    }
  };

  const goToJobAssets = (jobId: string) => {
    navigate(`/jobs/${jobId}?tab=assets`);
    setIsNotificationsOpen(false);
  };

  // Initialize hidden jobs from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_NOTIF_JOB_IDS_KEY);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        setHiddenJobIds(new Set(arr));
      }
    } catch {
      // no-op
    }
  }, []);

  const persistHidden = (ids: Set<string>) => {
    try { localStorage.setItem(HIDDEN_NOTIF_JOB_IDS_KEY, JSON.stringify(Array.from(ids))); } catch {}
  };

  const hideJob = (jobId: string) => {
    setHiddenJobIds(prev => {
      const next = new Set(prev);
      next.add(jobId);
      persistHidden(next);
      // Immediately update current views
      setJobGroups(curr => curr.filter(j => j.jobId !== jobId));
      setNotifications(curr => curr.filter(n => n.jobId !== jobId));
      return next;
    });
  };
  const unhideJob = (jobId: string) => {
    setHiddenJobIds(prev => {
      const next = new Set(prev);
      next.delete(jobId);
      persistHidden(next);
      // Optionally re-load current detail view to include job again
      if (detailStatus) { void loadDetailForStatus(detailStatus); }
      return next;
    });
  };
  const clearHidden = () => {
    setHiddenJobIds(new Set());
    try { localStorage.removeItem(HIDDEN_NOTIF_JOB_IDS_KEY); } catch {}
    if (detailStatus) { void loadDetailForStatus(detailStatus); }
  };

  // Realtime updates: refresh summary on new/updated assets
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notif-assets-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'neta_ops', table: 'assets' }, (payload) => {
        const s = (payload.new as any)?.status as StatusKey | undefined;
        if (s && (s === 'ready_for_review' || s === 'issue' || s === 'approved')) {
          void loadNotificationSummary();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'neta_ops', table: 'assets' }, (payload) => {
        const s = (payload.new as any)?.status as StatusKey | undefined;
        if (s && (s === 'ready_for_review' || s === 'issue' || s === 'approved')) {
          void loadNotificationSummary();
        }
      })
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [user]);

  // Lightweight realtime subscription to refresh notifications promptly
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('portal-notifs-assets')
      .on('postgres_changes', { event: '*', schema: 'neta_ops', table: 'assets' }, () => {
        if (rtDebounceRef.current) window.clearTimeout(rtDebounceRef.current);
        rtDebounceRef.current = window.setTimeout(() => {
          void loadNotificationSummary();
          rtDebounceRef.current = null;
        }, 250);
      })
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [user]);

  // Mark-as-seen helpers (do not auto-clear)
  const markAllSeenInCurrentStatus = () => {
    if (!detailStatus || notifications.length === 0) return;
    markStatusSeen(detailStatus, notifications);
  };

  const markJobSeenInCurrentStatus = (jobId: string) => {
    if (!detailStatus || notifications.length === 0) return;
    const related = notifications.filter(n => n.jobId === jobId);
    if (related.length > 0) {
      markStatusSeen(detailStatus, related);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground dark:bg-black dark:text-white">
      {/* Header */}
      <div className="bg-white dark:bg-dark-150 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          {/* AMP Logo */}
          <div className="flex items-center">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
              alt="AMP Logo"
              className="h-12"
            />
          </div>
          
          {/* Right side - Chat and Profile */}
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative" ref={notificationsRef}>
              <button
                aria-label="Notifications"
                className="rounded-full w-10 h-10 p-0 flex items-center justify-center bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 relative"
                onClick={() => {
                  const next = !isNotificationsOpen;
                  setIsNotificationsOpen(next);
                  if (next) {
                    // When opening the panel, start at summary
                    setDetailStatus(null);
                    setJobGroups([]);
                    setNotifications([]);
                    void loadNotificationSummary();
                  }
                }}
              >
                <Bell className="h-5 w-5 text-gray-600 dark:text-white" />
                {Object.values(unseenCounts).some(c => c > 0) && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center">
                    {Math.min(99, Object.values(unseenCounts).reduce((a, b) => a + b, 0))}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-96 max-w-[24rem] origin-top-right rounded-md bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="p-3 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-white">Notifications</div>
                    <div className="text-xs text-gray-500 dark:text-white">Reports</div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifLoading ? (
                      <div className="p-4 text-sm text-gray-500 dark:text-white">Loading…</div>
                    ) : detailStatus === null ? (
                      // Summary view
                      <div className="divide-y divide-gray-200 dark:divide-dark-200">
                        {notificationSummary.map((row) => (
                          <button
                            key={row.status}
                            onClick={() => loadDetailForStatus(row.status)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-200 flex items-center justify-between"
                          >
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {row.status === 'ready_for_review' && 'Report approvals'}
                              {row.status === 'issue' && 'Report Issues'}
                              {row.status === 'approved' && 'Reports approved'}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-gray-600 dark:text-white">
                                {row.jobCount} jobs • {row.reportCount} reports
                              </div>
                              {unseenCounts[row.status] > 0 && (
                                <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[16px] text-center">
                                  {Math.min(99, unseenCounts[row.status])}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      // Detail view for a status
                      <div>
                        <div className="px-4 py-2 text-xs text-gray-500 dark:text-white border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
                          <span>
                            {detailStatus === 'ready_for_review' && 'Report approvals'}
                            {detailStatus === 'issue' && 'Report Issues'}
                            {detailStatus === 'approved' && 'Reports approved'}
                          </span>
                          <div className="flex items-center gap-3">
                            {detailStatus && (
                              <button
                                onClick={markAllSeenInCurrentStatus}
                                className="text-[#f26722] hover:underline"
                              >
                                Mark all seen
                              </button>
                            )}
                            <button onClick={() => { setDetailStatus(null); setJobGroups([]); setNotifications([]); }} className="text-[#f26722] hover:underline">Back</button>
                          </div>
                        </div>
                        {jobGroups.length === 0 ? (
                          <div className="p-4 text-sm text-gray-500 dark:text-white">No items</div>
                        ) : (
                          <div className="divide-y divide-gray-100 dark:divide-dark-200">
                            {jobGroups.map((jg) => (
                              <div key={jg.jobId} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <button onClick={() => goToJobAssets(jg.jobId)} className="text-sm font-medium text-gray-900 dark:text-white hover:underline">
                                      {jg.jobNumber ? `Job ${jg.jobNumber}` : 'Job'} • {jg.jobTitle}
                                    </button>
                                    <div className="text-xs text-gray-600 dark:text-white">{jg.count} reports • Oldest {new Date(jg.oldest).toLocaleString()}</div>
                                  </div>
                                  {detailStatus && (
                                    <button
                                      onClick={() => markJobSeenInCurrentStatus(jg.jobId)}
                                      className="text-xs text-gray-500 dark:text-white hover:underline whitespace-nowrap"
                                    >
                                      Mark seen
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-2 border-t border-gray-200 dark:border-dark-200 text-right">
                    {detailStatus === null ? (
                      <button
                        onClick={() => navigate('/neta/reports')}
                        className="text-xs text-[#f26722] hover:underline"
                      >
                        View all
                      </button>
                    ) : (
                      <button
                        onClick={() => { setDetailStatus(null); setJobGroups([]); setNotifications([]); }}
                        className="text-xs text-[#f26722] hover:underline"
                      >
                        Back to summary
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <ChatButton />
            <div className="relative" ref={profileMenuRef}>
              <button
                className="rounded-full w-10 h-10 bg-gray-100 dark:bg-dark-150 hover:bg-gray-200 dark:hover:bg-gray-600 p-0 overflow-hidden flex items-center justify-center border border-gray-300 dark:border-gray-600"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              >
                {user?.user_metadata?.profileImage ? (
                  <img
                    src={user.user_metadata.profileImage}
                    alt="Profile"
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-5 w-5 text-gray-600 dark:text-white" />
                )}
              </button>
              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-md bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="py-1">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-dark-200">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-900">
                        {user?.user_metadata?.name || 'User'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-dark-400 truncate">
                        {user?.user_metadata?.role || 'No role assigned'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-dark-500 truncate mt-1">
                        {user?.email || 'Loading...'}
                      </p>
                    </div>
                    <button
                      onClick={handleViewProfile}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                    >
                      <Eye className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                      View Profile
                    </button>
                    <button
                      onClick={handleSettings}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                    >
                      <Settings className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                      Settings
                    </button>
                    <button
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                    >
                      <LogOut className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />
                      {isSigningOut ? 'Signing out...' : 'Sign Out'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Popup */}
      <SettingsPopup 
        isOpen={settingsMenuOpen} 
        onClose={() => setSettingsMenuOpen(false)} 
        onAbout={handleAbout}
        currentUser={{
          name: user?.user_metadata?.name,
          email: user?.email,
          role: user?.user_metadata?.role
        }}
      />
      
      <ProfileView 
        isOpen={isProfileViewOpen} 
        onClose={() => setIsProfileViewOpen(false)} 
      />
      
      <AboutPopup 
        isOpen={isAboutOpen} 
        onClose={() => setIsAboutOpen(false)} 
      />
      
      <WelcomePopup 
        isOpen={isWelcomeOpen} 
        onClose={() => setIsWelcomeOpen(false)}
        isNewUser={false} 
        userEmail={user?.email}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b bg-gray-50 dark:bg-black dark:border-dark-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-16">
            <div className="inline-flex px-2.5 py-1 rounded-full bg-orange-50 text-orange-500 dark:bg-dark-700/20 dark:text-white text-sm font-medium mb-6">
              Welcome
            </div>
            <h1 className="text-[56px] font-bold tracking-tight text-gray-900 dark:text-white mb-4">AMP Portal System</h1>
            <p className="text-lg text-gray-600 dark:text-white mb-8 max-w-[640px]">
              Access the tools and resources you need through our streamlined portal system.
            </p>
            <div className="flex gap-3">
              <Button 
                className="bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 px-8 text-base rounded-full inline-flex items-center whitespace-nowrap"
                onClick={handleWelcome}
              >
                Get Started <span className="ml-1">›</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-11 px-5 text-base rounded-md border-gray-200 text-gray-600 hover:text-gray-900 dark:border-dark-300 dark:text-white dark:hover:text-white dark:hover:bg-dark-700/20"
                onClick={handleAbout}
              >
                Learn More
              </Button>
              <a
                href="/assets/offline-software.zip"
                download
                className="inline-flex items-center justify-center h-11 px-5 text-base rounded-md border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:border-dark-300 dark:text-white dark:hover:text-white dark:hover:bg-dark-700/20"
              >
                Get Offline Software
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* User Shortcuts Section */}
      <div className="mt-10 max-w-[1400px] mx-auto">
        <div className="flex justify-between items-center mb-2 px-4 sm:px-6 lg:px-8">
          <h3 className="text-lg font-medium">My Shortcuts</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label 
                htmlFor="default-shortcuts-toggle" 
                className="text-sm text-gray-600 dark:text-white"
              >
                Default to {defaultToShow ? 'show' : 'hide'}:
              </label>
              <button
                id="default-shortcuts-toggle"
                onClick={toggleDefaultBehavior}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                  defaultToShow ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    defaultToShow ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleShortcuts} 
              className="text-gray-500 hover:text-gray-700 dark:text-white dark:hover:text-white"
            >
              {showShortcuts ? (
                <>Hide <ChevronUp className="ml-1 h-4 w-4" /></>
              ) : (
                <>Show <ChevronDown className="ml-1 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
        {showShortcuts && <ShortcutDisplay />}
      </div>

      {/* Review Shortcuts Section */}
      <div className="mt-6 max-w-[1400px] mx-auto">
        <div className="flex justify-between items-center mb-2 px-4 sm:px-6 lg:px-8">
          <h3 className="text-lg font-medium">Review Shortcuts</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label 
                htmlFor="default-review-shortcuts-toggle" 
                className="text-sm text-gray-600 dark:text-white"
              >
                Default to {defaultToShowReview ? 'show' : 'hide'}:
              </label>
              <button
                id="default-review-shortcuts-toggle"
                onClick={toggleDefaultReviewBehavior}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                  defaultToShowReview ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    defaultToShowReview ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleReviewShortcuts} 
              className="text-gray-500 hover:text-gray-700 dark:text-white dark:hover:text-white"
            >
              {showReviewShortcuts ? (
                <>Hide <ChevronUp className="ml-1 h-4 w-4" /></>
              ) : (
                <>Show <ChevronDown className="ml-1 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
        {showReviewShortcuts && (
          <div className="px-4 sm:px-6 lg:px-8">
            <ReviewShortcuts />
          </div>
        )}
      </div>

      {/* Portal Section */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="space-y-3 text-center mb-16">
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Select Your Portal</h2>
          <p className="text-lg text-gray-600 dark:text-white max-w-2xl mx-auto">
            Choose the appropriate portal to access specialized tools and resources.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center mb-12">
            <TabsList className="inline-flex bg-gray-100 dark:bg-dark-150 p-1.5 rounded-lg gap-1">
              <TabsTrigger value="all" className="px-6 py-2.5 rounded-md text-sm font-medium text-gray-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm">All Portals</TabsTrigger>
              <TabsTrigger value="tech" className="px-6 py-2.5 rounded-md text-sm font-medium text-gray-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm">Technician</TabsTrigger>
              <TabsTrigger value="admin" className="px-6 py-2.5 rounded-md text-sm font-medium text-gray-700 dark:text-white data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm">Administrative</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* NETA Technician Group */}
              {/* North Alabama Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-rose-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-rose-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">North Alabama Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Work orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Scheduling</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('north_alabama')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Tennessee Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-emerald-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-emerald-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Tennessee Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Work orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Scheduling</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('tennessee')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Georgia Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-blue-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-blue-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Georgia Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Work orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Scheduling</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('georgia')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* International Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-sky-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-sky-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">International Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">International operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Global projects</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">International</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Resource coordination</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical support</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('international')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Other Technician Group */}
              {/* Calibration Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-indigo-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-indigo-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Calibration Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Calibration services and management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Lab Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Calibration orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Service</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Equipment tracking</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Inventory</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('calibration')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Armadillo Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-amber-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-amber-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Armadillo Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Specialized field services</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Lab Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Service requests</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Equipment management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Assets</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical support</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('armadillo')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Scavenger Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-purple-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-purple-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Scavenger Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Specialized technical operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Scavs</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Operations</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Technical</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Resource planning</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Equipment tracking</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Assets</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('scavenger')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Admin Group */}
              {/* HR Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-rose-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-rose-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">HR Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Human resources management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">HR Reps</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Employee management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">HR</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Benefits administration</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Admin</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Policy management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Documents</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("HR Portal", '/hr')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Office Admins Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-violet-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-violet-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Office Admins Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Administrative operations and management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Office Admins</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Office management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Admin</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Resource allocation</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Administrative tasks</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Operations</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Office Admins Portal", '/office')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Other Roles Group */}
              {/* Sales Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-emerald-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-emerald-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Sales Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Sales operations and management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Sales Reps</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Sales pipeline</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Sales</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Customer management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">CRM</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Opportunity tracking</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Pipeline</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Sales Portal", '/sales-dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Engineering Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-cyan-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-cyan-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Engineering Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Engineering and technical resources</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Engineering</Badge>
                </CardHeader>
                
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Design approval</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Workflow</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical documentation</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Library</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Standards compliance</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Updates</Badge>
                    </div>
                  </div>
                </CardContent>
                
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Engineering Portal", '/engineering/dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tech">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* NETA Technician Group */}
              {/* North Alabama Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-rose-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-rose-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">North Alabama Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Work orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Scheduling</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('north_alabama')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Tennessee Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-emerald-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-emerald-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Tennessee Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Work orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Scheduling</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('tennessee')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Georgia Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-blue-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-blue-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Georgia Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Work orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Scheduling</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('georgia')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* International Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-sky-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-sky-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">International Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">International operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Global projects</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">International</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Resource coordination</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical support</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('international')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Other Technician Group */}
              {/* Calibration Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-indigo-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-indigo-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Calibration Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Calibration services and management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Lab Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Calibration orders</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Service</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Equipment tracking</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Inventory</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical resources</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('calibration')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Armadillo Division */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-amber-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-amber-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Armadillo Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Specialized field services</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Lab Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Service requests</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Field</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Equipment management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Assets</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical support</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Support</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('armadillo')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Scavenger Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-purple-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-purple-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Scavenger Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Specialized technical operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Scavs</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Operations</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Technical</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Resource planning</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Equipment tracking</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Assets</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('scavenger')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="admin">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Admin Portal - Only visible to admins */}
              {isAdmin && (
                <Card className="border border-gray-200 dark:border-dark-300">
                  <CardHeader className="flex flex-row items-start justify-between p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-full bg-purple-50 dark:bg-dark-700/20">
                        <Shield className="h-5 w-5 text-purple-500 dark:text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Admin Portal</CardTitle>
                        <CardDescription className="text-sm text-gray-500 dark:text-white/70">System administration and management</CardDescription>
                      </div>
                    </div>
                    <Badge className="!bg-purple-500 !text-white px-2.5 py-1 text-xs font-medium">Admin Only</Badge>
                  </CardHeader>
                  <CardContent className="px-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-white">User management</span>
                        <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Users</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-white">Role management</span>
                        <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Roles</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-white">System settings</span>
                        <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Settings</Badge>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="px-6 pb-6 pt-0">
                    <Button 
                      className="w-full bg-purple-500 hover:bg-purple-600 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                      onClick={() => handleOtherPortalClick('/admin-dashboard')}
                    >
                      Access Portal <span className="ml-1">›</span>
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {/* HR Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-rose-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-rose-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">HR Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Human resources management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">HR Reps</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Employee management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">HR</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Benefits administration</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Admin</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Policy management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Documents</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("HR Portal", '/hr')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Office Admins Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-violet-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-violet-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Office Admins Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Administrative operations and management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Office Admins</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Office management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Admin</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Resource allocation</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Planning</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Administrative tasks</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Operations</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Office Admins Portal", '/office')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Other Roles Group */}
              {/* Sales Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-emerald-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-emerald-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Sales Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Sales operations and management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Sales Reps</Badge>
                </CardHeader>
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Sales pipeline</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Sales</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Customer management</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">CRM</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Opportunity tracking</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Pipeline</Badge>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Sales Portal", '/sales-dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Engineering Portal */}
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-cyan-50 dark:bg-dark-700/20">
                      <Building className="h-5 w-5 text-cyan-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Engineering Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Engineering and technical resources</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Engineering</Badge>
                </CardHeader>
                
                <CardContent className="px-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Design approval</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Workflow</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Technical documentation</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Library</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-white">Standards compliance</span>
                      <Badge variant="outline" className="text-xs font-normal px-2.5 py-0.5 text-gray-500 dark:text-white bg-gray-50 dark:bg-dark-700/20">Updates</Badge>
                    </div>
                  </div>
                </CardContent>
                
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Engineering Portal", '/engineering/dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Logout Section */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-200 dark:border-dark-200">
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-gray-100 dark:bg-dark-700/20 mb-4">
            <LogOut className="h-6 w-6 text-gray-600 dark:text-white" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Need to sign out?</h3>
          <p className="text-sm text-gray-600 dark:text-white mb-6 max-w-md mx-auto">
            Click the button below to securely sign out of your account and return to the login page.
          </p>
          <Button 
            onClick={handleSignOut}
            disabled={isSigningOut}
            variant="outline"
            className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-dark-700/20 hover:text-gray-900 dark:hover:text-white"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </Button>
        </div>
      </section>
      {/* Popup */}
      {showPopup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleGenericPopupBackdropClick} // Add onClick here
        >
          <div 
            className="bg-white dark:bg-dark-150 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the content
          >
            <div className="text-gray-900 dark:text-dark-900 mb-4 text-center">{popupContent}</div>
            <div className="flex justify-center">
              <Button 
                className="bg-[#f26722] hover:bg-[#f26722]/90 text-white px-8 py-2 rounded-md dark:bg-amp-gold-600 dark:hover:bg-amp-gold-700"
                onClick={() => setShowPopup(false)}
              >
                Okay
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 