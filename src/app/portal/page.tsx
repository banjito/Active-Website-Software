import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import Card from "../../components/ui/Card"
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/Card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/Tabs"
import { Badge } from "../../components/ui"
import { ChevronRight, Building, MapPin, Bell, User as UserIcon, Settings, LogOut, FileText, Eye, Shield, ChevronDown, ChevronUp, Calendar, Edit3, X as XIcon, HelpCircle, EyeOff, Megaphone, Pin, Briefcase, Phone, Loader2, BookOpen, Gauge, AlertTriangle, MoreVertical, Check, AlertCircle, Image as ImageIcon } from "lucide-react"
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react"
import { useAuth } from "../../lib/AuthContext"
import { useDivision } from '../../App'
import { ThemeToggle } from '../../components/theme/theme-toggle'
import { useDemoMode } from '../../lib/DemoModeContext'
import { SettingsPopup } from '../../components/ui/SettingsPopup'
import { ProfileView } from "@/components/profile/ProfileView"
import { AboutPopup } from "@/components/ui/AboutPopup"
import { WelcomePopup } from "@/components/ui/WelcomePopup"
import { usePermissions } from '@/hooks/usePermissions'
import { Portal } from '@/lib/roles'
import { ShortcutDisplay } from '@/components/shortcuts/ShortcutDisplay'
import { ShortcutService, Shortcut } from '@/services/ShortcutService'
import { ShortcutManagerDndKit } from '@/components/shortcuts/ShortcutManagerDndKit'
import { ReviewShortcuts } from '@/components/shortcuts/ReviewShortcuts'
import { IssueShortcuts } from '@/components/shortcuts/IssueShortcuts'
import { ApprovedShortcuts } from '@/components/shortcuts/ApprovedShortcuts'
import { supabase } from "@/lib/supabase"
import { fetchAmpContacts } from "@/services/ampContactsService"
import type { AmpContact } from "@/services/ampContactsService"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu"
import { onboardingService } from "@/services/hr/onboardingService"
import { toast } from "@/components/ui/toast"

type ReviewNotification = {
  jobId: string;
  jobTitle: string;
  jobNumber?: string;
  assetId: string;
  assetName: string;
  createdAt: string;
  status?: 'ready_for_review' | 'approved' | 'issue';
  urgency?: 'normal' | 'critical';
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
  hasCritical: boolean;
};

// Hidden jobs (dev aid) key
const HIDDEN_NOTIF_JOB_IDS_KEY = 'hiddenNotificationJobIds';
const NOTIF_LAST_SEEN_KEY = 'notifLastSeenByStatus';

type StatusKey = 'ready_for_review' | 'issue' | 'approved';

type CalibrationDetailStatus = 'needs_calibration' | 'equipment_out_of_cal';
type NotificationDetailStatus = NotificationSummary['status'] | CalibrationDetailStatus | null;

type CalibrationEquipmentItem = {
  id: string;
  equipment_name: string;
  calibration_due_date: string;
  serial_number: string | null;
  amp_id: string | null;
};

export default function PortalLanding() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isDemoMode, toggleDemoMode, maskJobTitle } = useDemoMode();
  const [searchParams] = useSearchParams();
  
  // Demo mode button is now visible to all users
  const canSeeDemoMode = !!user;
  const [showPopup, setShowPopup] = useState(false);
  const [popupContent, setPopupContent] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<ReviewNotification[]>([]);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary[]>([]);
  const [detailStatus, setDetailStatus] = useState<NotificationDetailStatus>(null);
  const [jobGroups, setJobGroups] = useState<JobGroup[]>([]);
  const [calibrationNeedsList, setCalibrationNeedsList] = useState<CalibrationEquipmentItem[]>([]);
  const [calibrationOutList, setCalibrationOutList] = useState<CalibrationEquipmentItem[]>([]);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [isProfileViewOpen, setIsProfileViewOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [headerShortcuts, setHeaderShortcuts] = useState<Shortcut[]>([]);
  const [isShortcutManagerOpen, setIsShortcutManagerOpen] = useState(false);
  const [hiddenShortcutCount, setHiddenShortcutCount] = useState(0);
  const shortcutsBarRef = useRef<HTMLDivElement>(null);
  const [showReviewShortcuts, setShowReviewShortcuts] = useState(false);
  const [showIssueShortcuts, setShowIssueShortcuts] = useState(false);
  const [showApprovedShortcuts, setShowApprovedShortcuts] = useState(false);
  const [defaultToShow, setDefaultToShow] = useState(false);
  const [defaultToShowReview, setDefaultToShowReview] = useState(false);
  const [defaultToShowIssue, setDefaultToShowIssue] = useState(false);
  const [defaultToShowApproved, setDefaultToShowApproved] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [portalPreferences, setPortalPreferences] = useState({
    showWelcome: true,
    showMyShortcuts: true,
    showReviewShortcuts: true,
    showIssueShortcuts: true,
    showApprovedShortcuts: true,
    showAnnouncements: true,
    hiddenPortals: [] as string[]
  });
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const contactsRef = useRef<HTMLDivElement>(null);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [ampContacts, setAmpContacts] = useState<AmpContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const { setDivision } = useDivision();
  const { isAdmin, checkPortalAccess } = usePermissions();
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Record<StatusKey, string>>({ ready_for_review: '', issue: '', approved: '' });
  const [unseenCounts, setUnseenCounts] = useState<Record<StatusKey, number>>({ ready_for_review: 0, issue: 0, approved: 0 });
  const [portalAnnouncements, setPortalAnnouncements] = useState<{id: string; title: string; content: string; excerpt: string | null; author_name: string; category: string; is_pinned: boolean; published_at: string | null; created_at: string}[]>([]);
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState<string | null>(null);
  const [visibleAnnouncementCount, setVisibleAnnouncementCount] = useState(3);
  /** Per-user state: acknowledged (opened) and dismissed (hidden from home). Dismissed announcements still visible under HR > Announcements. */
  const [userAnnouncementState, setUserAnnouncementState] = useState<Record<string, { acknowledged_at: string | null; dismissed_at: string | null; signed_at: string | null }>>({});
  const [dismissingAnnouncementId, setDismissingAnnouncementId] = useState<string | null>(null);
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [ackModalDocUrl, setAckModalDocUrl] = useState<string | null>(null);
  const [ackModalTitle, setAckModalTitle] = useState<string>('');
  const [ackFormId, setAckFormId] = useState<string | null>(null);
  const [ackFormName, setAckFormName] = useState<string>('');
  const [ackResolvingForm, setAckResolvingForm] = useState(false);
  const [ackAnnouncementId, setAckAnnouncementId] = useState<string | null>(null);
  const [ackSignatureData, setAckSignatureData] = useState<string>('');
  const [ackSigning, setAckSigning] = useState(false);
  const ackCanvasRef = useRef<HTMLCanvasElement>(null);
  const ackIsDrawingRef = useRef(false);
  const rtDebounceRef = useRef<number | null>(null);
  const preferenceSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stripAnnouncementSystemLinks = useCallback((content: string) => {
    return content
      .replace(/\n\n---\n📘 \[View Help Guide\]\([^)]+\)/g, '')
      .replace(/\n\n---\n📄 \[View & Acknowledge Document\]\([^)]+\)/g, '')
      .replace(/\n\n---\n📎 \[Attachment\]\([^)]+\)/g, '');
  }, []);

  const extractAnnouncementAttachments = useCallback((content: string) => {
    const matches = content.matchAll(/📎 \[Attachment\]\(([^)]+)\)/g);
    return Array.from(matches).map((m) => m[1]).filter(Boolean);
  }, []);

  // Resolve ESign form by document URL when ack modal opens
  useEffect(() => {
    if (!ackModalOpen || !ackModalDocUrl) return;
    setAckFormId(null);
    setAckFormName('');
    setAckResolvingForm(true);
    let cancelled = false;
    (async () => {
      try {
        const forms = await onboardingService.getESignForms({});
        const docUrl = ackModalDocUrl;
        const form = forms.find((f: any) => {
          const docs = f.custom_fields?.attached_documents;
          return Array.isArray(docs) && docs[0]?.file_url === docUrl;
        });
        if (!cancelled && form) {
          setAckFormId(form.id);
          setAckFormName(form.name || 'Document');
        }
      } catch {
        if (!cancelled) setAckFormId(null);
      } finally {
        if (!cancelled) setAckResolvingForm(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ackModalOpen, ackModalDocUrl]);

  const openAckModal = (docUrl: string, title: string, announcementId: string) => {
    setAckModalDocUrl(docUrl);
    setAckModalTitle(title);
    setAckAnnouncementId(announcementId);
    setAckSignatureData('');
    setAckModalOpen(true);
  };

  const closeAckModal = () => {
    setAckModalOpen(false);
    setAckModalDocUrl(null);
    setAckModalTitle('');
    setAckAnnouncementId(null);
    setAckFormId(null);
    setAckFormName('');
    setAckSignatureData('');
  };

  const ackStartDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!ackCanvasRef.current) return;
    const canvas = ackCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ackIsDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = ('touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left) * scaleX;
    const y = ('touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top) * scaleY;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const ackDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!ackIsDrawingRef.current || !ackCanvasRef.current) return;
    const canvas = ackCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = ('touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left) * scaleX;
    const y = ('touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top) * scaleY;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const ackStopDrawing = () => {
    ackIsDrawingRef.current = false;
    if (ackCanvasRef.current) setAckSignatureData(ackCanvasRef.current.toDataURL());
  };

  const ackClearSignature = () => {
    if (ackCanvasRef.current) {
      const ctx = ackCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, ackCanvasRef.current.width, ackCanvasRef.current.height);
      setAckSignatureData('');
    }
  };

  const ackSubmit = async () => {
    if (!user?.id || !ackFormId || !ackSignatureData) return;
    setAckSigning(true);
    try {
      const signerName = user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown';
      const signerEmail = user.email || '';
      const signedNow = new Date().toISOString();
      await onboardingService.createESignSubmission({
        form_id: ackFormId,
        signer_email: signerEmail,
        signer_name: signerName,
        signatures: [{ field_name: 'acknowledgment', signature_image: ackSignatureData, signed_at: signedNow }],
        form_data: {},
        status: 'signed',
        signed_at: signedNow,
      } as any);
      if (ackAnnouncementId) {
        const existing = userAnnouncementState[ackAnnouncementId];
        const { error: stateError } = await supabase
          .schema('common')
          .from('user_announcement_state')
          .upsert(
            {
              user_id: user.id,
              announcement_id: ackAnnouncementId,
              acknowledged_at: existing?.acknowledged_at ?? signedNow,
              dismissed_at: existing?.dismissed_at ?? null,
              signed_at: signedNow,
              updated_at: signedNow,
            },
            { onConflict: 'user_id,announcement_id', ignoreDuplicates: false }
          );
        if (stateError) {
          console.error('Error persisting signed_at state:', stateError);
        } else {
          setUserAnnouncementState((prev) => ({
            ...prev,
            [ackAnnouncementId]: {
              acknowledged_at: prev[ackAnnouncementId]?.acknowledged_at ?? signedNow,
              dismissed_at: prev[ackAnnouncementId]?.dismissed_at ?? null,
              signed_at: signedNow,
            },
          }));
        }
      }
      toast({ title: 'Success', description: 'Acknowledgment recorded.', variant: 'success' });
      closeAckModal();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to submit', variant: 'destructive' });
    } finally {
      setAckSigning(false);
    }
  };

  // Load preferences from database
  const loadPreferencesFromDB = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .schema('common')
        .from('profiles')
        .select('portal_preferences')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.warn('Could not load portal preferences from DB:', error.message);
        return null;
      }
      
      return data?.portal_preferences;
    } catch (e) {
      console.warn('Error loading portal preferences from DB:', e);
      return null;
    }
  };

  // Save preferences to database (debounced)
  const savePreferencesToDB = async (userId: string, preferences: any) => {
    try {
      const { error } = await supabase
        .schema('common')
        .from('profiles')
        .update({ portal_preferences: preferences })
        .eq('id', userId);
      
      if (error) {
        console.warn('Could not save portal preferences to DB:', error.message);
      }
    } catch (e) {
      console.warn('Error saving portal preferences to DB:', e);
    }
  };

  // Initialize preferences from database (if logged in) or localStorage
  useEffect(() => {
    const initPreferences = async () => {
      let dbPreferences = null;
      
      // Try to load from database if user is logged in
      if (user?.id) {
        dbPreferences = await loadPreferencesFromDB(user.id);
      }
      
      if (dbPreferences && typeof dbPreferences === 'object' && !Array.isArray(dbPreferences)) {
        // Use database preferences
        const {
          defaultToShowShortcuts: dbDefaultShow,
          defaultToShowReviewShortcuts: dbDefaultReview,
          defaultToShowIssueShortcuts: dbDefaultIssue,
          defaultToShowApprovedShortcuts: dbDefaultApproved,
          ...restPrefs
        } = dbPreferences as Record<string, any>;
        
        // Set default behavior preferences from DB
        const defaultBehavior = dbDefaultShow === true;
        const defaultReviewBehavior = dbDefaultReview === true;
        const defaultIssueBehavior = dbDefaultIssue === true;
        const defaultApprovedBehavior = dbDefaultApproved !== false; // Default to true
        
        setDefaultToShow(defaultBehavior);
        setDefaultToShowReview(defaultReviewBehavior);
        setDefaultToShowIssue(defaultIssueBehavior);
        setDefaultToShowApproved(defaultApprovedBehavior);
        
        setShowShortcuts(defaultBehavior);
        setShowReviewShortcuts(defaultReviewBehavior);
        setShowIssueShortcuts(defaultIssueBehavior);
        setShowApprovedShortcuts(defaultApprovedBehavior);
        
        // Set portal preferences from DB - merge with defaults to ensure new properties are included
        setPortalPreferences(prev => ({
          ...prev,
          showWelcome: restPrefs.showWelcome ?? prev.showWelcome,
          showMyShortcuts: restPrefs.showMyShortcuts ?? prev.showMyShortcuts,
          showReviewShortcuts: restPrefs.showReviewShortcuts ?? prev.showReviewShortcuts,
          showIssueShortcuts: restPrefs.showIssueShortcuts ?? prev.showIssueShortcuts,
          // Explicitly default showApprovedShortcuts to true if not set in DB
          showApprovedShortcuts: restPrefs.showApprovedShortcuts ?? true,
          showAnnouncements: restPrefs.showAnnouncements ?? true,
          hiddenPortals: restPrefs.hiddenPortals ?? prev.hiddenPortals
        }));
        
        // Also update localStorage for faster loading next time
        localStorage.setItem('defaultToShowShortcuts', defaultBehavior.toString());
        localStorage.setItem('defaultToShowReviewShortcuts', defaultReviewBehavior.toString());
        localStorage.setItem('defaultToShowIssueShortcuts', defaultIssueBehavior.toString());
        localStorage.setItem('defaultToShowApprovedShortcuts', defaultApprovedBehavior.toString());
        if (restPrefs.showWelcome !== undefined) {
          localStorage.setItem('portalPreferences', JSON.stringify(restPrefs));
        }
      } else {
        // Fall back to localStorage
        const savedDefaultPreference = localStorage.getItem('defaultToShowShortcuts');
        const savedDefaultReviewPreference = localStorage.getItem('defaultToShowReviewShortcuts');
        const savedDefaultIssuePreference = localStorage.getItem('defaultToShowIssueShortcuts');
        const savedDefaultApprovedPreference = localStorage.getItem('defaultToShowApprovedShortcuts');
        
        // Determine the default behavior values
        const defaultBehavior = savedDefaultPreference === 'true';
        const defaultReviewBehavior = savedDefaultReviewPreference === 'true';
        const defaultIssueBehavior = savedDefaultIssuePreference === 'true';
        // Default to true for approved shortcuts if no preference is saved
        const defaultApprovedBehavior = savedDefaultApprovedPreference === null ? true : savedDefaultApprovedPreference === 'true';
        
        // Set default behavior preferences
        setDefaultToShow(defaultBehavior);
        setDefaultToShowReview(defaultReviewBehavior);
        setDefaultToShowIssue(defaultIssueBehavior);
        setDefaultToShowApproved(defaultApprovedBehavior);
        
        // Always use the default behavior on page load/refresh
        // This means the toggle controls what happens on refresh
        setShowShortcuts(defaultBehavior);
        setShowReviewShortcuts(defaultReviewBehavior);
        setShowIssueShortcuts(defaultIssueBehavior);
        setShowApprovedShortcuts(defaultApprovedBehavior);
        
        // Load portal preferences from localStorage - merge with defaults to ensure new properties are included
        const savedPortalPreferences = localStorage.getItem('portalPreferences');
        if (savedPortalPreferences) {
          try {
            const parsed = JSON.parse(savedPortalPreferences);
            // Merge with defaults to ensure new properties (like showApprovedShortcuts) are included
            setPortalPreferences(prev => ({
              ...prev,
              ...parsed,
              // Explicitly ensure showApprovedShortcuts defaults to true if not set
              showApprovedShortcuts: parsed.showApprovedShortcuts ?? true,
              showAnnouncements: parsed.showAnnouncements ?? true
            }));
          } catch (e) {
            console.error('Error parsing portal preferences:', e);
          }
        }
      }
      
      // Mark as initialized to prevent saving on initial load
      setIsInitialized(true);
    };
    
    initPreferences();
  }, [user?.id]);

  // Save all preferences to localStorage and database when they change
  useEffect(() => {
    if (isInitialized) {
      // Save to localStorage immediately for fast access
      localStorage.setItem('portalPreferences', JSON.stringify(portalPreferences));
      localStorage.setItem('defaultToShowShortcuts', defaultToShow.toString());
      localStorage.setItem('defaultToShowReviewShortcuts', defaultToShowReview.toString());
      localStorage.setItem('defaultToShowIssueShortcuts', defaultToShowIssue.toString());
      localStorage.setItem('defaultToShowApprovedShortcuts', defaultToShowApproved.toString());
      
      // Debounce database save to avoid too many requests
      if (preferenceSaveTimeoutRef.current) {
        clearTimeout(preferenceSaveTimeoutRef.current);
      }
      
      if (user?.id) {
        preferenceSaveTimeoutRef.current = setTimeout(() => {
          // Combine all preferences into one object for database storage
          const allPreferences = {
            ...portalPreferences,
            defaultToShowShortcuts: defaultToShow,
            defaultToShowReviewShortcuts: defaultToShowReview,
            defaultToShowIssueShortcuts: defaultToShowIssue,
            defaultToShowApprovedShortcuts: defaultToShowApproved
          };
          savePreferencesToDB(user.id, allPreferences);
        }, 1000); // Wait 1 second before saving to DB
      }
    }
    
    return () => {
      if (preferenceSaveTimeoutRef.current) {
        clearTimeout(preferenceSaveTimeoutRef.current);
      }
    };
  }, [portalPreferences, defaultToShow, defaultToShowReview, defaultToShowIssue, defaultToShowApproved, isInitialized, user?.id]);

  // Fetch published announcements for portal display
  useEffect(() => {
    async function fetchPortalAnnouncements() {
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .schema('common')
          .from('announcements')
          .select('id, title, content, excerpt, author_name, category, is_pinned, published_at, created_at')
          .eq('is_published', true)
          .or(`published_at.is.null,published_at.lte.${now}`)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('is_pinned', { ascending: false })
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(10);
        if (error) {
          console.error('Error fetching portal announcements:', error);
          return;
        }
        setPortalAnnouncements(data || []);
      } catch (err) {
        console.error('Error fetching portal announcements:', err);
      }
    }
    fetchPortalAnnouncements();
  }, []);

  // Fetch current user's announcement state (acknowledged / dismissed) so we can hide dismissed on home
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema('common')
          .from('user_announcement_state')
          .select('announcement_id, acknowledged_at, dismissed_at, signed_at')
          .eq('user_id', user.id);
        if (error) {
          console.error('Error fetching user announcement state:', error);
          return;
        }
        const byId: Record<string, { acknowledged_at: string | null; dismissed_at: string | null; signed_at: string | null }> = {};
        (data || []).forEach((row: { announcement_id: string; acknowledged_at: string | null; dismissed_at: string | null; signed_at: string | null }) => {
          byId[row.announcement_id] = { acknowledged_at: row.acknowledged_at, dismissed_at: row.dismissed_at, signed_at: row.signed_at };
        });
        setUserAnnouncementState(byId);
      } catch (err) {
        console.error('Error fetching user announcement state:', err);
      }
    })();
  }, [user?.id]);

  // When user expands an announcement, record acknowledged (so they can later dismiss)
  useEffect(() => {
    if (!user?.id || !expandedAnnouncementId) return;
    (async () => {
      try {
        const now = new Date().toISOString();
        const existing = userAnnouncementState[expandedAnnouncementId];
        const { error } = await supabase
          .schema('common')
          .from('user_announcement_state')
          .upsert(
            {
              user_id: user.id,
              announcement_id: expandedAnnouncementId,
              acknowledged_at: now,
              dismissed_at: existing?.dismissed_at ?? null,
              signed_at: existing?.signed_at ?? null,
              updated_at: now,
            },
            { onConflict: 'user_id,announcement_id', ignoreDuplicates: false }
          )
          .select();
        if (error) {
          console.error('Error recording announcement acknowledged:', error);
          return;
        }
        setUserAnnouncementState((prev) => ({
          ...prev,
          [expandedAnnouncementId]: {
            acknowledged_at: now,
            dismissed_at: prev[expandedAnnouncementId]?.dismissed_at ?? null,
            signed_at: prev[expandedAnnouncementId]?.signed_at ?? null,
          },
        }));
      } catch (err) {
        console.error('Error recording announcement acknowledged:', err);
      }
    })();
  }, [user?.id, expandedAnnouncementId]);

  const dismissAnnouncement = async (announcementId: string) => {
    if (!user?.id) return;
    const existing = userAnnouncementState[announcementId];
    const announcement = portalAnnouncements.find((a) => a.id === announcementId);
    const requiresSignature = announcement ? /📄 \[View & Acknowledge Document\]\([^)]+\)/.test(announcement.content) : false;
    if (requiresSignature && !existing?.signed_at) {
      toast({ title: 'Signature required', description: 'You must sign this announcement before you can dismiss it.', variant: 'destructive' });
      return;
    }
    if (!requiresSignature && !existing?.acknowledged_at) {
      toast({ title: 'Open first', description: 'Open the announcement to review it before you can dismiss it.', variant: 'destructive' });
      return;
    }
    setDismissingAnnouncementId(announcementId);
    try {
      const { error } = await supabase
        .schema('common')
        .from('user_announcement_state')
        .upsert(
          {
            user_id: user.id,
            announcement_id: announcementId,
            acknowledged_at: existing?.acknowledged_at ?? new Date().toISOString(),
            dismissed_at: new Date().toISOString(),
            signed_at: existing?.signed_at ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,announcement_id', ignoreDuplicates: false }
        );
      if (error) throw error;
      setUserAnnouncementState((prev) => ({
        ...prev,
        [announcementId]: { ...prev[announcementId], acknowledged_at: existing?.acknowledged_at ?? new Date().toISOString(), dismissed_at: new Date().toISOString(), signed_at: existing?.signed_at ?? null },
      }));
      toast({ title: 'Dismissed', description: 'Announcement hidden from home. You can still find it under HR → Announcements.', variant: 'success' });
    } catch (err) {
      console.error('Error dismissing announcement:', err);
      toast({ title: 'Error', description: 'Could not dismiss announcement.', variant: 'destructive' });
    } finally {
      setDismissingAnnouncementId(null);
    }
  };

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
      if (contactsRef.current && !contactsRef.current.contains(event.target as Node)) {
        setIsContactsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuRef, notificationsRef, contactsRef]);

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
      "Office Admins Portal": "office",
      "Engineering Portal": "engineering",
      "Field Technician Portal": "field_tech",
      "Global Portal": "neta",
      "Scavenger Portal": "scavenger", // Scavenger portal has its own portal type
      "HR Portal": "hr"
    };

    // Map portal names to their URLs if not provided
    const portalUrls: Record<string, string> = {
      "Sales Portal": "/sales-dashboard",
      "NETA Portal": "/neta",
      "Lab Portal": "/lab",
      "Office Admins Portal": "/office",
      "Engineering Portal": "/engineering", // Updated to use the new engineering page
      "Field Technician Portal": "/field-tech/dashboard",
      "Global Portal": "/all-jobs",
      "Runway": "/meetings",
      "Scavenger Portal": "/scavenger",
      "HR Portal": "/hr/dashboard"
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

  const handleEnterEditMode = () => {
    setIsEditMode(true);
    setIsProfileMenuOpen(false);
  };

  const handleExitEditMode = () => {
    setIsEditMode(false);
  };

  const togglePortalPreference = (key: keyof typeof portalPreferences) => {
    setPortalPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const togglePortalVisibility = (portalName: string) => {
    setPortalPreferences(prev => ({
      ...prev,
      hiddenPortals: prev.hiddenPortals.includes(portalName)
        ? prev.hiddenPortals.filter(p => p !== portalName)
        : [...prev.hiddenPortals, portalName]
    }));
  };

  const isPortalHidden = (portalName: string) => {
    return portalPreferences.hiddenPortals.includes(portalName);
  };

  const handleSelectAllPortals = () => {
    setPortalPreferences(prev => ({
      ...prev,
      hiddenPortals: []
    }));
  };

  const handleDeselectAllPortals = () => {
    const allPortals = [
      'North Alabama Division',
      'Tennessee Division',
      'Georgia Division',
      'International Division',
      'Field Technician Portal',
      'Global Portal',
      'Armadillo Lab',
      'Scavenger Portal',
      'Office Admins Portal',
      'Sales Portal',
      'Engineering Portal',
      'Admin Portal',
      'Runway Meeting Portal'
    ];
    setPortalPreferences(prev => ({
      ...prev,
      hiddenPortals: allPortals
    }));
  };

  // Helper component to wrap portal cards with visibility logic
  const PortalCardWrapper = ({ portalName, children }: { portalName: string; children: React.ReactNode }) => {
    if (!isPortalHidden(portalName) || isEditMode) {
      return (
        <div className={isEditMode && isPortalHidden(portalName) ? 'opacity-50' : ''}>
          {children}
        </div>
      );
    }
    return null;
  };

  // Handle backdrop click for the generic popup
  const handleGenericPopupBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if the click is directly on the backdrop itself
    if (e.target === e.currentTarget) {
      setShowPopup(false);
    }
  };

  // Load shortcuts for header tabs
  const loadHeaderShortcuts = async () => {
    if (!user) return;
    try {
      const data = await ShortcutService.getUserShortcuts(user.id);
      setHeaderShortcuts(data);
    } catch (err) {
      console.error('Error loading header shortcuts:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadHeaderShortcuts();
    }
  }, [user]);

  // Map path prefix to division context so shortcut navigation shows correct portal
  const setDivisionFromShortcutPath = (path: string) => {
    const segment = path.replace(/^\//, '').split('/')[0];
    if (!segment) return;
    const pathToDivision: Record<string, string> = {
      'field-tech': 'field_tech',
      'north_alabama': 'north_alabama',
      'tennessee': 'tennessee',
      'georgia': 'georgia',
      'international': 'international',
      'calibration': 'calibration',
      'armadillo': 'armadillo',
      'scavenger': 'scavenger',
      'sales-dashboard': 'sales',
      'sales': 'sales',
      'engineering': 'engineering',
      'hr': 'hr',
      'lab': 'lab',
      'office': 'office',
      'admin-dashboard': 'admin',
      'admin': 'admin',
      'meetings': 'meetings',
    };
    if (pathToDivision[segment]) setDivision(pathToDivision[segment]);
    else setDivision(null);
  };

  const handleHeaderShortcutClick = (url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank');
    } else {
      setDivisionFromShortcutPath(url);
      navigate(url);
    }
  };

  const handleShortcutManagerClose = () => {
    setIsShortcutManagerOpen(false);
    loadHeaderShortcuts();
  };

  // Dynamically calculate how many shortcuts overflow the container
  useEffect(() => {
    const container = shortcutsBarRef.current;
    if (!container) return;

    const calculate = () => {
      const buttons = container.querySelectorAll('[data-shortcut-tab]');
      const containerRight = container.getBoundingClientRect().right;
      let hidden = 0;
      buttons.forEach((btn) => {
        if ((btn as HTMLElement).getBoundingClientRect().right > containerRight + 1) {
          hidden++;
        }
      });
      setHiddenShortcutCount(hidden);
    };

    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    // Recalculate after a short delay to let layout settle
    requestAnimationFrame(calculate);

    return () => observer.disconnect();
  }, [headerShortcuts]);

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

  // Toggle issue shortcuts visibility
  const toggleIssueShortcuts = () => {
    setShowIssueShortcuts(prev => !prev);
  };

  // Toggle default issue shortcuts behavior
  const toggleDefaultIssueBehavior = () => {
    setDefaultToShowIssue(prev => !prev);
  };

  // Toggle approved shortcuts visibility
  const toggleApprovedShortcuts = () => {
    setShowApprovedShortcuts(prev => !prev);
  };

  // Toggle default approved shortcuts behavior
  const toggleDefaultApprovedBehavior = () => {
    setDefaultToShowApproved(prev => !prev);
  };

  // helper to fetch assets by status and produce job groups
  const fetchAssetsByStatus = async (status: 'ready_for_review' | 'approved' | 'issue') => {
    const { data: assetsData, error: assetsError } = await supabase
      .schema('neta_ops')
      .from('assets')
      .select('id, name, created_at, status, urgency')
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

    // Create a lookup for urgency by asset id
    const urgencyByAsset: Record<string, 'normal' | 'critical'> = {};
    assetsData.forEach(a => { urgencyByAsset[a.id] = a.urgency || 'normal'; });

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
          jobTitle: maskJobTitle(jb?.title) || 'Job',
          jobNumber: jb?.job_number,
          count: 0,
          oldest: a.created_at,
          hasCritical: false,
        };
      }
      groupMap[jid].count += 1;
      if (a.urgency === 'critical') {
        groupMap[jid].hasCritical = true;
      }
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
        jobTitle: maskJobTitle(jobById[jobIdByAsset[a.id]]?.title) || 'Job',
        jobNumber: jobById[jobIdByAsset[a.id]]?.job_number,
        assetId: a.id,
        assetName: a.name,
        createdAt: a.created_at,
        status: status,
        urgency: a.urgency || 'normal',
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

      // Field equipment calibration: due within 1 month (Needs Calibration) vs expired (Equipment Out of Cal)
      try {
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const dueInOneMonth = new Date(today);
        dueInOneMonth.setMonth(dueInOneMonth.getMonth() + 1);
        const dueInOneMonthStr = dueInOneMonth.toISOString().slice(0, 10);

        const { data: equipmentRows } = await supabase
          .schema('neta_ops')
          .from('field_equipment')
          .select('id, equipment_name, calibration_due_date, in_service, serial_number, amp_id')
          .not('calibration_due_date', 'is', null);

        const inServiceFiltered = (equipmentRows || []).filter(
          (r: { in_service?: boolean }) => r.in_service !== false
        ) as { id: string; equipment_name: string; calibration_due_date: string; serial_number: string | null; amp_id: string | null }[];

        const needs: CalibrationEquipmentItem[] = [];
        const out: CalibrationEquipmentItem[] = [];
        for (const r of inServiceFiltered) {
          const due = r.calibration_due_date ? String(r.calibration_due_date).slice(0, 10) : '';
          if (!due) continue;
          const item: CalibrationEquipmentItem = {
            id: r.id,
            equipment_name: r.equipment_name,
            calibration_due_date: due,
            serial_number: r.serial_number ?? null,
            amp_id: r.amp_id ?? null,
          };
          if (due < todayStr) out.push(item);
          else if (due <= dueInOneMonthStr) needs.push(item);
        }
        setCalibrationNeedsList(needs);
        setCalibrationOutList(out);
      } catch (calErr) {
        console.error('Failed to load calibration summary:', calErr);
        setCalibrationNeedsList([]);
        setCalibrationOutList([]);
      }

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
      setCalibrationNeedsList([]);
      setCalibrationOutList([]);
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

  // Realtime updates: refresh summary on new/updated assets (single consolidated channel)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notif-assets-realtime')
      .on('postgres_changes', { event: '*', schema: 'neta_ops', table: 'assets' }, (payload) => {
        const s = (payload.new as any)?.status as StatusKey | undefined;
        if (s && (s === 'ready_for_review' || s === 'issue' || s === 'approved')) {
          // Debounce rapid changes to avoid hammering the server
          if (rtDebounceRef.current) window.clearTimeout(rtDebounceRef.current);
          rtDebounceRef.current = window.setTimeout(() => {
            void loadNotificationSummary();
            rtDebounceRef.current = null;
          }, 250);
        }
      })
      .subscribe();

    return () => {
      try {
        if (rtDebounceRef.current) window.clearTimeout(rtDebounceRef.current);
        supabase.removeChannel(channel);
      } catch {}
    };
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
        <div className="flex items-center w-full min-w-0">
          {/* AMP Logo */}
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
            alt="AMP Logo"
            className="h-12 shrink-0"
          />

          {/* Shortcut Tabs - centered in the middle */}
          <div className="hidden sm:flex items-center justify-center flex-1 min-w-0 ml-4 border-l border-gray-200 dark:border-gray-700 pl-4">
            <div ref={shortcutsBarRef} className="flex items-center gap-0.5">
              {headerShortcuts.slice(0, 8).map((shortcut) => (
                <button
                  key={shortcut.id}
                  data-shortcut-tab
                  onClick={() => handleHeaderShortcutClick(shortcut.url)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#f26722] dark:hover:text-[#f26722] hover:bg-orange-50 dark:hover:bg-dark-200 rounded-md transition-colors whitespace-nowrap border border-transparent hover:border-orange-200 dark:hover:border-orange-900/30"
                  title={shortcut.url}
                >
                  {shortcut.title}
                </button>
              ))}
              {(hiddenShortcutCount + Math.max(0, headerShortcuts.length - 8)) > 0 && (
                <span className="shrink-0 px-2 py-1 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  +{hiddenShortcutCount + Math.max(0, headerShortcuts.length - 8)} more
                </span>
              )}
            </div>
          </div>
          
          {/* Right side - Edit shortcuts, contacts, notifications, profile */}
          <div className="flex items-center gap-4 shrink-0 ml-4">
            <button
              onClick={() => setIsShortcutManagerOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-[#f26722] dark:hover:text-[#f26722] hover:bg-orange-50 dark:hover:bg-dark-200 rounded-md transition-colors shrink-0 border border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-900/30"
              title="Add, edit, or reorder your shortcuts"
            >
              <Settings className="h-3.5 w-3.5" />
              Edit
            </button>
            {/* AMP contacts */}
            <div className="relative" ref={contactsRef}>
              <button
                aria-label="AMP contacts"
                className="rounded-full w-10 h-10 p-0 flex items-center justify-center bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
                onClick={() => {
                  const next = !isContactsOpen;
                  setIsContactsOpen(next);
                  if (next) {
                    setIsNotificationsOpen(false);
                    setContactsLoading(true);
                    setAmpContacts([]);
                    fetchAmpContacts()
                      .then(setAmpContacts)
                      .catch(() => setAmpContacts([]))
                      .finally(() => setContactsLoading(false));
                  }
                }}
              >
                <Phone className="h-5 w-5 text-gray-600 dark:text-white" />
              </button>
              {isContactsOpen && (
                <div className="absolute right-0 mt-2 w-[420px] max-w-[calc(100vw-2rem)] origin-top-right rounded-md bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 max-h-[28rem] flex flex-col">
                  <div className="p-3 border-b border-gray-200 dark:border-dark-200 flex items-center justify-between shrink-0">
                    <div className="font-medium text-gray-900 dark:text-white">AMP contacts</div>
                    <a
                      href="/hr/data/call-list"
                      className="text-xs text-[#f26722] hover:underline"
                      onClick={() => setIsContactsOpen(false)}
                    >
                      Manage in HR portal
                    </a>
                  </div>
                  <div className="overflow-y-auto flex-1 min-h-0">
                    {contactsLoading ? (
                      <div className="p-4 text-sm text-gray-500 dark:text-white">Loading…</div>
                    ) : ampContacts.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500 dark:text-white">No contacts. Add them in HR portal → HR Data → Call list.</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-dark-200">
                          <tr>
                            <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Name</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Phone</th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-dark-200">
                          {ampContacts.map((c) => (
                            <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-dark-200/50">
                              <td className="py-2 px-3 text-gray-900 dark:text-white">
                                <a href={`mailto:${c.email}`} className="hover:underline">{c.name}</a>
                              </td>
                              <td className="py-2 px-3">
                                <a href={`tel:${c.work_phone.replace(/\D/g, '')}`} className="text-[#f26722] hover:underline">{c.work_phone}</a>
                              </td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{c.role || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Notifications */}
            <div className="relative" ref={notificationsRef}>
              <button
                aria-label="Notifications"
                className="rounded-full w-10 h-10 p-0 flex items-center justify-center bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 relative"
                onClick={() => {
                  const next = !isNotificationsOpen;
                  setIsNotificationsOpen(next);
                  if (next) {
                    setIsContactsOpen(false);
                    setDetailStatus(null);
                    setJobGroups([]);
                    setNotifications([]);
                    void loadNotificationSummary();
                  }
                }}
              >
                <Bell className="h-5 w-5 text-gray-600 dark:text-white" />
                {(Object.values(unseenCounts).some(c => c > 0) || calibrationNeedsList.length > 0 || calibrationOutList.length > 0) && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] leading-[18px] text-center">
                    {Math.min(99, Object.values(unseenCounts).reduce((a, b) => a + b, 0) + calibrationNeedsList.length + calibrationOutList.length)}
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
                        <button
                          onClick={() => setDetailStatus('needs_calibration')}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-200 flex items-center justify-between"
                        >
                          <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-amber-500" />
                            Needs Calibration
                          </div>
                          <div className="text-xs text-gray-600 dark:text-white">
                            {calibrationNeedsList.length} {calibrationNeedsList.length === 1 ? 'item' : 'items'}
                          </div>
                        </button>
                        <button
                          onClick={() => setDetailStatus('equipment_out_of_cal')}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-200 flex items-center justify-between"
                        >
                          <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Equipment Out of Cal
                          </div>
                          <div className="text-xs text-gray-600 dark:text-white">
                            {calibrationOutList.length} {calibrationOutList.length === 1 ? 'item' : 'items'}
                          </div>
                        </button>
                      </div>
                    ) : detailStatus === 'needs_calibration' || detailStatus === 'equipment_out_of_cal' ? (
                      // Calibration detail view
                      <div>
                        <div className="px-4 py-2 text-xs text-gray-500 dark:text-white border-b border-gray-200 dark:border-dark-200 flex items-center justify-between">
                          <span>
                            {detailStatus === 'needs_calibration' ? 'Needs Calibration' : 'Equipment Out of Cal'}
                          </span>
                          <button
                            onClick={() => { setDetailStatus(null); setJobGroups([]); setNotifications([]); }}
                            className="text-[#f26722] hover:underline"
                          >
                            Back
                          </button>
                        </div>
                        {(detailStatus === 'needs_calibration' ? calibrationNeedsList : calibrationOutList).length === 0 ? (
                          <div className="p-4 text-sm text-gray-500 dark:text-white">No items</div>
                        ) : (
                          <div className="divide-y divide-gray-100 dark:divide-dark-200">
                            {(detailStatus === 'needs_calibration' ? calibrationNeedsList : calibrationOutList).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setIsNotificationsOpen(false);
                                  navigate(`/neta/field-equipment?open=${encodeURIComponent(item.id)}`);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-200 text-sm transition-colors"
                              >
                                <div className="font-medium text-gray-900 dark:text-white">{item.equipment_name}</div>
                                <div className="text-xs text-gray-600 dark:text-white mt-0.5 space-y-0.5">
                                  {(item.amp_id || item.serial_number) && (
                                    <div className="flex flex-wrap gap-x-3 gap-y-0">
                                      {item.amp_id && <span>AMP ID: {item.amp_id}</span>}
                                      {item.serial_number && <span>SN: {item.serial_number}</span>}
                                    </div>
                                  )}
                                  <div>Due: {new Date(item.calibration_due_date + 'T00:00:00').toLocaleDateString()}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
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
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => goToJobAssets(jg.jobId)} className="text-sm font-medium text-gray-900 dark:text-white hover:underline">
                                        {jg.jobNumber ? `Job ${jg.jobNumber}` : 'Job'} • {maskJobTitle(jg.jobTitle)}
                                      </button>
                                      {jg.hasCritical && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                          ⚠️ Critical
                                        </span>
                                      )}
                                    </div>
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
                  <div className="p-2 border-t border-gray-200 dark:border-dark-200 text-right flex items-center justify-end gap-3">
                    {detailStatus === null ? (
                      <button
                        onClick={() => navigate('/neta/reports')}
                        className="text-xs text-[#f26722] hover:underline"
                      >
                        View all
                      </button>
                    ) : detailStatus === 'needs_calibration' || detailStatus === 'equipment_out_of_cal' ? (
                      <>
                        <button
                          onClick={() => navigate('/neta/field-equipment')}
                          className="text-xs text-[#f26722] hover:underline"
                        >
                          View field equipment
                        </button>
                        <button
                          onClick={() => { setDetailStatus(null); setJobGroups([]); setNotifications([]); }}
                          className="text-xs text-[#f26722] hover:underline"
                        >
                          Back to summary
                        </button>
                      </>
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
                    {canSeeDemoMode && (
                      <button
                        onClick={toggleDemoMode}
                        className="flex items-center justify-between w-full px-4 py-2 text-sm text-gray-700 dark:text-[#f26722] hover:bg-gray-100 dark:hover:bg-dark-50"
                      >
                        <span className="flex items-center">
                          {isDemoMode ? <EyeOff className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" /> : <Eye className="mr-3 h-5 w-5 text-gray-400 dark:text-[#f26722]" />}
                          Demo Mode
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          isDemoMode ? 'bg-[#f26722] text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                        }`}>
                          {isDemoMode ? 'On' : 'Off'}
                        </span>
                      </button>
                    )}
                    <div className="border-t border-gray-200 dark:border-dark-200 my-1" />
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
        onEnterEditMode={handleEnterEditMode}
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

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="bg-[#f26722] text-white py-3 px-4 sm:px-6 lg:px-8 sticky top-0 z-50 shadow-md">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Edit3 className="h-5 w-5" />
              <div>
                <h3 className="font-semibold">Edit Mode</h3>
                <p className="text-sm text-white/90">Customize which sections and portals are visible</p>
              </div>
            </div>
            <Button
              onClick={handleExitEditMode}
              variant="outline"
              className="border-white text-white hover:bg-white hover:text-[#f26722]"
            >
              Exit Edit Mode
            </Button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className={`relative overflow-hidden border-b bg-gray-50 dark:bg-black dark:border-dark-200 ${!portalPreferences.showWelcome && !isEditMode ? 'hidden' : ''}`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-16">
            {isEditMode && (
              <div className="flex items-center justify-between mb-4 p-3 bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-700 dark:text-white">Welcome Section</span>
                <button
                  onClick={() => togglePortalPreference('showWelcome')}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    portalPreferences.showWelcome ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      portalPreferences.showWelcome ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
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

      {/* Announcements Section - Top of page */}
      <div className={`max-w-[1400px] mx-auto mt-8 ${!portalPreferences.showAnnouncements && !isEditMode ? 'hidden' : ''}`}>
        {isEditMode && (
          <div className="flex items-center justify-between mb-4 p-3 mx-4 sm:mx-6 lg:mx-8 bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-white">Announcements Section</span>
            <button
              type="button"
              role="switch"
              aria-checked={portalPreferences.showAnnouncements}
              onClick={() => togglePortalPreference('showAnnouncements')}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                portalPreferences.showAnnouncements ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  portalPreferences.showAnnouncements ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
        {portalAnnouncements.length > 0 ? (
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-[#f26722]/10">
                <Megaphone className="h-6 w-6 text-[#f26722]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Announcements</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Latest updates from your organization</p>
              </div>
            </div>
            <div className="space-y-4">
              {portalAnnouncements.filter((a) => !userAnnouncementState[a.id]?.dismissed_at).length === 0 && portalAnnouncements.length > 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                  You&apos;ve dismissed all visible announcements. View all under{' '}
                  <Link to="/hr/announcements" className="text-[#f26722] hover:underline">HR → Announcements</Link>.
                </p>
              ) : null}
              {portalAnnouncements
                .filter((a) => !userAnnouncementState[a.id]?.dismissed_at)
                .slice(0, visibleAnnouncementCount)
                .map((a) => {
                  const isAcknowledged = !!userAnnouncementState[a.id]?.acknowledged_at;
                  const requiresSignature = /📄 \[View & Acknowledge Document\]\([^)]+\)/.test(a.content);
                  const isSigned = !!userAnnouncementState[a.id]?.signed_at;
                  const signedAtDate = userAnnouncementState[a.id]?.signed_at;
                  const canDismiss = requiresSignature ? isSigned : isAcknowledged;
                  return (
                <div
                  key={a.id}
                  className={`bg-white dark:bg-dark-150 rounded-xl shadow-md border ${
                    a.is_pinned
                      ? 'border-l-4 border-l-[#f26722] border-t border-r border-b border-t-gray-200 border-r-gray-200 border-b-gray-200 dark:border-t-gray-700 dark:border-r-gray-700 dark:border-b-gray-700 ring-1 ring-[#f26722]/10'
                      : 'border-gray-200 dark:border-gray-700'
                  } p-5 cursor-pointer hover:shadow-lg transition-all`}
                  onClick={() => setExpandedAnnouncementId(expandedAnnouncementId === a.id ? null : a.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {a.is_pinned && <Pin className="h-4 w-4 text-[#f26722] flex-shrink-0" />}
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">
                          {a.title}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          a.category === 'company' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          a.category === 'hr' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                          a.category === 'safety' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          a.category === 'event' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          a.category === 'policy' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          a.category === 'benefit' ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' :
                          a.category === 'training' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {a.category.charAt(0).toUpperCase() + a.category.slice(1)}
                        </span>
                        {requiresSignature && (
                          isSigned ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              <Check className="h-3 w-3" />
                              Signed {signedAtDate ? new Date(signedAtDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              <AlertCircle className="h-3 w-3" />
                              Signature required
                            </span>
                          )
                        )}
                      </div>
                      {expandedAnnouncementId === a.id ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 whitespace-pre-wrap leading-relaxed">
                          {stripAnnouncementSystemLinks(a.content)}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                          stripAnnouncementSystemLinks(a.excerpt || a.content)
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-medium">{a.author_name}</span>
                        <span>{a.published_at ? new Date(a.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      {(() => {
                        const guideMatch = a.content.match(/📘 \[View Help Guide\]\(([^)]+)\)/);
                        const docMatch = a.content.match(/📄 \[View & Acknowledge Document\]\(([^)]+)\)/);
                        const attachmentUrls = extractAnnouncementAttachments(a.content);
                        const guidePath = guideMatch ? guideMatch[1] : null;
                        const docUrl = docMatch ? docMatch[1] : null;
                        if (!guidePath && !docUrl && attachmentUrls.length === 0) return null;
                        return (
                          <div className="flex flex-wrap items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                            {guidePath && (
                              <Link
                                to={guidePath.startsWith('/') ? guidePath : `/${guidePath}`}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#f26722] hover:bg-[#f26722]/90 rounded-md transition-colors shadow-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <BookOpen className="h-4 w-4" />
                                View Help Guide
                              </Link>
                            )}
                            {docUrl && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#f26722] hover:bg-[#f26722]/90 rounded-md transition-colors shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAckModal(docUrl, a.title, a.id);
                                }}
                              >
                                <FileText className="h-4 w-4" />
                                View & Acknowledge document
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      {(() => {
                        const attachmentUrls = extractAnnouncementAttachments(a.content);
                        if (attachmentUrls.length === 0 || expandedAnnouncementId !== a.id) return null;
                        return (
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
                            {attachmentUrls.map((url, idx) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer" className="block border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden hover:opacity-90 transition-opacity">
                                <img src={url} alt={`Announcement attachment ${idx + 1}`} className="w-full h-32 object-contain bg-gray-100 dark:bg-dark-300" loading="lazy" />
                              </a>
                            ))}
                          </div>
                        );
                      })()}
                      {extractAnnouncementAttachments(a.content).length > 0 && (
                        <span className="inline-flex items-center gap-1 mt-2 text-xs text-[#f26722] font-medium">
                          <ImageIcon className="h-3 w-3" />
                          {extractAnnouncementAttachments(a.content).length} image attachment{extractAnnouncementAttachments(a.content).length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-dark-200 focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                            aria-label="Announcement options"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[180px]">
                          <DropdownMenuItem
                            disabled={!canDismiss || dismissingAnnouncementId === a.id}
                            onClick={() => dismissAnnouncement(a.id)}
                            className={!canDismiss ? 'opacity-60' : ''}
                          >
                            {dismissingAnnouncementId === a.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <EyeOff className="h-4 w-4 mr-2" />
                            )}
                            {!canDismiss
                              ? (requiresSignature ? 'Sign announcement to dismiss' : 'Open announcement first to dismiss')
                              : (dismissingAnnouncementId === a.id ? 'Dismissing…' : 'Dismiss from home')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ChevronRight className={`h-5 w-5 text-gray-400 mt-1 transition-transform ${expandedAnnouncementId === a.id ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </div>
              ); })}
              {portalAnnouncements.filter((a) => !userAnnouncementState[a.id]?.dismissed_at).length > visibleAnnouncementCount ? (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setVisibleAnnouncementCount((prev) => prev + 3)}
                    className="text-sm font-medium text-[#f26722] hover:text-[#d95d1d] hover:underline transition-colors"
                  >
                    See more
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : isEditMode ? (
          <div className="px-4 sm:px-6 lg:px-8 py-6 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-[#f26722]" />
            Announcements will appear here when published from HR &rarr; Announcements.
          </div>
        ) : null}
      </div>

      {/* View & Acknowledge document modal */}
      <Dialog open={ackModalOpen} onOpenChange={(open) => { if (!open) closeAckModal(); }}>
        <DialogContent className="w-[95vw] max-w-7xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden p-6">
          <DialogHeader>
            <DialogTitle>View & Acknowledge: {ackModalTitle || 'Document'}</DialogTitle>
            <DialogDescription>
              Review the document below, then sign at the bottom to acknowledge.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
            {ackModalDocUrl && (
              <div className="border rounded-lg overflow-hidden flex-1 min-h-0 bg-gray-100 dark:bg-gray-900" style={{ minHeight: '50vh' }}>
                <iframe
                  title="Document"
                  src={ackModalDocUrl}
                  className="w-full h-full min-h-[50vh]"
                  style={{ minHeight: '50vh' }}
                />
              </div>
            )}
            {ackResolvingForm && (
              <div className="flex items-center gap-2 text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading acknowledgment form…
              </div>
            )}
            {!ackResolvingForm && !ackFormId && ackModalDocUrl && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                This document could not be found for acknowledgment. You can still view it above or go to HR → Compliance → Document Acknowledgment to sign there.
              </p>
            )}
            {!ackResolvingForm && ackFormId && (
              <div className="space-y-2 shrink-0">
                <label className="text-sm font-medium">Your signature</label>
                <div className="border rounded-lg bg-white dark:bg-dark-150 p-2">
                  <canvas
                    ref={ackCanvasRef}
                    width={500}
                    height={120}
                    className="border border-gray-300 dark:border-gray-600 rounded w-full cursor-crosshair touch-none"
                    style={{ maxWidth: '100%', height: '120px' }}
                    onMouseDown={ackStartDrawing}
                    onMouseMove={ackDraw}
                    onMouseUp={ackStopDrawing}
                    onMouseLeave={ackStopDrawing}
                    onTouchStart={ackStartDrawing}
                    onTouchMove={ackDraw}
                    onTouchEnd={ackStopDrawing}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={ackClearSignature}>Clear</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAckModal}>
              Cancel
            </Button>
            {ackFormId && (
              <Button onClick={ackSubmit} disabled={!ackSignatureData || ackSigning}>
                {ackSigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit acknowledgment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortcut Manager Modal (triggered from header gear icon) */}
      <ShortcutManagerDndKit isOpen={isShortcutManagerOpen} onClose={handleShortcutManagerClose} />

      {/* Review Shortcuts Section */}
      <div className={`mt-6 max-w-[1400px] mx-auto ${!portalPreferences.showReviewShortcuts && !isEditMode ? 'hidden' : ''}`}>
        {isEditMode && (
          <div className="flex items-center justify-between mb-4 p-3 mx-4 sm:mx-6 lg:mx-8 bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-white">Review Shortcuts Section</span>
            <button
              onClick={() => togglePortalPreference('showReviewShortcuts')}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                portalPreferences.showReviewShortcuts ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  portalPreferences.showReviewShortcuts ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
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

      {/* Issue Shortcuts Section */}
      <div className={`mt-6 max-w-[1400px] mx-auto ${!portalPreferences.showIssueShortcuts && !isEditMode ? 'hidden' : ''}`}>
        {isEditMode && (
          <div className="flex items-center justify-between mb-4 p-3 mx-4 sm:mx-6 lg:mx-8 bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-white">Issue Shortcuts Section</span>
            <button
              onClick={() => togglePortalPreference('showIssueShortcuts')}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                portalPreferences.showIssueShortcuts ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  portalPreferences.showIssueShortcuts ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
        <div className="flex justify-between items-center mb-2 px-4 sm:px-6 lg:px-8">
          <h3 className="text-lg font-medium">Issue Shortcuts</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label 
                htmlFor="default-issue-shortcuts-toggle" 
                className="text-sm text-gray-600 dark:text-white"
              >
                Default to {defaultToShowIssue ? 'show' : 'hide'}:
              </label>
              <button
                id="default-issue-shortcuts-toggle"
                onClick={toggleDefaultIssueBehavior}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                  defaultToShowIssue ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    defaultToShowIssue ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleIssueShortcuts} 
              className="text-gray-500 hover:text-gray-700 dark:text-white dark:hover:text-white"
            >
              {showIssueShortcuts ? (
                <>Hide <ChevronUp className="ml-1 h-4 w-4" /></>
              ) : (
                <>Show <ChevronDown className="ml-1 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
        {showIssueShortcuts && (
          <div className="px-4 sm:px-6 lg:px-8">
            <IssueShortcuts />
          </div>
        )}
      </div>

      {/* Approved Shortcuts Section */}
      <div className={`mt-6 max-w-[1400px] mx-auto ${!portalPreferences.showApprovedShortcuts && !isEditMode ? 'hidden' : ''}`}>
        {isEditMode && (
          <div className="flex items-center justify-between mb-4 p-3 mx-4 sm:mx-6 lg:mx-8 bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-white">Approved Shortcuts Section</span>
            <button
              onClick={() => togglePortalPreference('showApprovedShortcuts')}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                portalPreferences.showApprovedShortcuts ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  portalPreferences.showApprovedShortcuts ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
        <div className="flex justify-between items-center mb-2 px-4 sm:px-6 lg:px-8">
          <h3 className="text-lg font-medium">Approved Shortcuts</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label 
                htmlFor="default-approved-shortcuts-toggle" 
                className="text-sm text-gray-600 dark:text-white"
              >
                Default to {defaultToShowApproved ? 'show' : 'hide'}:
              </label>
              <button
                id="default-approved-shortcuts-toggle"
                onClick={toggleDefaultApprovedBehavior}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                  defaultToShowApproved ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    defaultToShowApproved ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleApprovedShortcuts} 
              className="text-gray-500 hover:text-gray-700 dark:text-white dark:hover:text-white"
            >
              {showApprovedShortcuts ? (
                <>Hide <ChevronUp className="ml-1 h-4 w-4" /></>
              ) : (
                <>Show <ChevronDown className="ml-1 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
        {showApprovedShortcuts && (
          <div className="px-4 sm:px-6 lg:px-8">
            <ApprovedShortcuts />
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

        {isEditMode && (
          <div className="mb-8 p-6 bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Portal Visibility Controls</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Toggle which portal cards you want to see. Hidden portals will not be shown when you exit edit mode.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAllPortals}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#f26722] hover:bg-[#f26722]/90 rounded-md transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllPortals}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-dark-100 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-dark-50 rounded-md transition-colors"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                'North Alabama Division',
                'Tennessee Division',
                'Georgia Division',
                'International Division',
                'Field Technician Portal',
                'Armadillo Lab',
                'Scavenger Portal',
                'Office Admins Portal',
                'Sales Portal',
                'Engineering Portal',
                'HR Portal',
                'Admin Portal',
                'Runway Meeting Portal'
              ].map(portalName => (
                <div key={portalName} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-100 rounded-md">
                  <span className="text-sm text-gray-700 dark:text-white">{portalName}</span>
                  <button
                    onClick={() => togglePortalVisibility(portalName)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      !isPortalHidden(portalName) ? 'bg-[#f26722]' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        !isPortalHidden(portalName) ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
              <PortalCardWrapper portalName="North Alabama Division">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-rose-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-rose-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Alabama Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('north_alabama')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Tennessee Division */}
              <PortalCardWrapper portalName="Tennessee Division">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('tennessee')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Georgia Division */}
              <PortalCardWrapper portalName="Georgia Division">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('georgia')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* International Portal */}
              <PortalCardWrapper portalName="International Division">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('international')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Other Technician Group */}
              {/* Field Technician Portal (Aggregated) */}
              <PortalCardWrapper portalName="Field Technician Portal">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-amber-50 dark:bg-dark-700/20">
                      <MapPin className="h-5 w-5 text-amber-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Field Technician Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Aggregate of NETA divisions</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">Field Tech</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Field Technician Portal", '/field-tech/dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Global Portal - Field Services + Engineering jobs */}
              <PortalCardWrapper portalName="Global Portal">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-amber-50 dark:bg-dark-700/20">
                      <Briefcase className="h-5 w-5 text-amber-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Global Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services + Engineering</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">All Portals</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Global Portal", '/all-jobs')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Armadillo Division */}
              <PortalCardWrapper portalName="Armadillo Lab">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => window.open('https://armadillobase.vercel.app', '_blank')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Scavenger Portal */}
              <PortalCardWrapper portalName="Scavenger Portal">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('scavenger')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Admin Group */}
              {/* Office Admins Portal */}
              <PortalCardWrapper portalName="Office Admins Portal">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Office Admins Portal", '/office')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Other Roles Group */}
              {/* Sales Portal */}
              <PortalCardWrapper portalName="Sales Portal">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Sales Portal", '/sales-dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Engineering Portal */}
              <PortalCardWrapper portalName="Engineering Portal">
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
                
                <CardContent className="px-6" />
                
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Engineering Portal", '/engineering/dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* HR Portal */}
              <PortalCardWrapper portalName="HR Portal">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-pink-50 dark:bg-dark-700/20">
                      <UserIcon className="h-5 w-5 text-pink-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">HR Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Human resources and employee management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">HR</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("HR Portal", '/hr/dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Runway */}
              <PortalCardWrapper portalName="Runway Meeting Portal">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-gray-50 dark:bg-dark-700/20">
                      <Calendar className="h-5 w-5 text-gray-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Runway</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Schedule and manage meetings</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">General</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => navigate('/meetings')}
                  >
                    Access Runway <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Features & Fixes */}
              <PortalCardWrapper portalName="Features & Fixes">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-orange-50 dark:bg-dark-700/20">
                      <FileText className="h-5 w-5 text-[#f26722] dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Features & Fixes</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">View issues, requests, and timelines</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">General</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => window.open('/features-fixes', '_blank', 'noopener,noreferrer')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Help Center */}
              <PortalCardWrapper portalName="Help Center">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-cyan-50 dark:bg-dark-700/20">
                      <HelpCircle className="h-5 w-5 text-cyan-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Help Center</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Guides and documentation for ampOS tasks</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">General</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => navigate('/help-center')}
                  >
                    Access Help Center <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>
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
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Alabama Division</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Field services and operations</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
                </CardHeader>
                <CardContent className="px-6" />
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
                <CardContent className="px-6" />
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
              <PortalCardWrapper portalName="Georgia Division">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('georgia')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* International Portal */}
              <PortalCardWrapper portalName="International Division">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('international')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Other Technician Group */}
              {/* Calibration Division */}
              <PortalCardWrapper portalName="Calibration Lab">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('calibration')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Armadillo Division */}
              <PortalCardWrapper portalName="Armadillo Lab">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => window.open('https://armadillobase.vercel.app', '_blank')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Scavenger Portal */}
              <PortalCardWrapper portalName="Scavenger Portal">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handleDivisionClick('scavenger')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>
            </div>
          </TabsContent>

          <TabsContent value="admin">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Admin Portal - Only visible to admins */}
              {isAdmin && (
                <PortalCardWrapper portalName="Admin Portal">
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
                  <CardContent className="px-6" />
                  <CardFooter className="px-6 pb-6 pt-0">
                    <Button 
                      className="w-full bg-purple-500 hover:bg-purple-600 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                      onClick={() => handleOtherPortalClick('/admin-dashboard')}
                    >
                      Access Portal <span className="ml-1">›</span>
                    </Button>
                  </CardFooter>
                </Card>
                </PortalCardWrapper>
              )}

              {/* Office Admins Portal */}
              <PortalCardWrapper portalName="Office Admins Portal">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Office Admins Portal", '/office')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Other Roles Group */}
              {/* Sales Portal */}
              <PortalCardWrapper portalName="Sales Portal">
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
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Sales Portal", '/sales-dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* Engineering Portal */}
              <PortalCardWrapper portalName="Engineering Portal">
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
                
                <CardContent className="px-6" />
                
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("Engineering Portal", '/engineering/dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>

              {/* HR Portal */}
              <PortalCardWrapper portalName="HR Portal">
              <Card className="border border-gray-200 dark:border-dark-300">
                <CardHeader className="flex flex-row items-start justify-between p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-full bg-pink-50 dark:bg-dark-700/20">
                      <UserIcon className="h-5 w-5 text-pink-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">HR Portal</CardTitle>
                      <CardDescription className="text-sm text-gray-500 dark:text-white/70">Human resources and employee management</CardDescription>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722] !text-white px-2.5 py-1 text-xs font-medium">HR</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => handlePortalClick("HR Portal", '/hr/dashboard')}
                  >
                    Access Portal <span className="ml-1">›</span>
                  </Button>
                </CardFooter>
              </Card>
              </PortalCardWrapper>
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