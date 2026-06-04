import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Button } from "../../components/ui/Button"
import Card from "../../components/ui/Card"
import { CardContent, CardFooter, CardHeader, CardTitle } from "../../components/ui/Card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/Tabs"
import { Badge } from "../../components/ui"
import { ChevronRight, Building, MapPin, CircleUserRound, LogOut, FileText, Eye, Shield, ChevronDown, ChevronUp, Calendar, Edit3, X as XIcon, HelpCircle, EyeOff, Megaphone, Pin, Briefcase, Loader2, BookOpen, Check, AlertCircle, Image as ImageIcon, Download, Plane, Globe, BriefcaseBusiness, Omega  } from "lucide-react"
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react"
import { useAuth } from "../../lib/AuthContext"
import { useDivision } from '../../App'
import { AboutPopup } from "@/components/ui/AboutPopup"
import { WelcomePopup } from "@/components/ui/WelcomePopup"
import { usePermissions } from '@/hooks/usePermissions'
import { Portal } from '@/lib/roles'
import { ReviewShortcuts } from '@/components/shortcuts/ReviewShortcuts'
import { IssueShortcuts } from '@/components/shortcuts/IssueShortcuts'
import { ApprovedShortcuts } from '@/components/shortcuts/ApprovedShortcuts'
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog"
import { onboardingService } from "@/services/hr/onboardingService"
import { toast } from "@/components/ui/toast"
import { HeaderBar } from '@/components/ui/HeaderBar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function PortalLanding() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [searchParams] = useSearchParams();
  const [showPopup, setShowPopup] = useState(false);
  const [popupContent, setPopupContent] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
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
  const { setDivision } = useDivision();
  const { isAdmin, checkPortalAccess } = usePermissions();
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

  const handleAbout = () => {
    setIsAboutOpen(true);
  };
  
  const handleWelcome = () => {
    setIsWelcomeOpen(true);
  };

  const handleEnterEditMode = () => {
    setIsEditMode(true);
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


  return (
    <div className="min-h-screen bg-background text-foreground dark:bg-black dark:text-white">
      <HeaderBar onEnterEditMode={handleEnterEditMode} />

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
      <section className={`relative overflow-hidden border-none bg-white dark:bg-black ${!portalPreferences.showWelcome && !isEditMode ? 'hidden' : ''}`}>
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
            <img
              src="/ampOS_full_logo.svg"
              alt="ampOS"
              className="h-[5rem] w-auto mb-4 dark:brightness-0 dark:invert"
            />
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="h-11 px-5 text-base rounded-md border-gray-200 text-gray-600 hover:text-gray-900 dark:border-dark-300 dark:text-white dark:hover:text-white dark:hover:bg-dark-700/20"
                onClick={handleAbout}
              >
                Learn More
              </Button>
              <Button
              onClick={() => window.open('/assets/offline-software.zip', '_blank')}
              className="inline-flex items-center justify-center h-11 px-5 !text-gray-600 rounded-md bg-transparent border border-gray-200 hover:bg-gray-100"
              leftIcon={<Download className="h-5 w-5 text-gray-600" />}
              >
                Offline Software
              </Button>
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
                          {stripAnnouncementSystemLinks(a.excerpt || a.content)}
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
                      <button
                        type="button"
                        disabled={!canDismiss || dismissingAnnouncementId === a.id}
                        onClick={() => dismissAnnouncement(a.id)}
                        className={`p-1.5 rounded-md focus:outline-none focus:ring-2 focus:ring-[#f26722] ${
                          canDismiss
                            ? 'text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-950/30'
                            : 'opacity-40 cursor-not-allowed text-gray-500 dark:text-gray-400'
                        }`}
                        title={
                          !canDismiss
                            ? (requiresSignature ? 'Acknowledge document first' : 'Open announcement first')
                            : (dismissingAnnouncementId === a.id ? 'Dismissing…' : 'Dismiss from home')
                        }
                        aria-label={
                          !canDismiss
                            ? (requiresSignature ? 'Acknowledge document first' : 'Open announcement first')
                            : 'Dismiss from home'
                        }
                      >
                        {dismissingAnnouncementId === a.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <EyeOff className="h-5 w-5" />
                        )}
                      </button>
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
                <LoadingSpinner size="md" />
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
          <div>
            <h3 className="text-lg font-medium">Review Shortcuts</h3>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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
              className="text-gray-500 hover:text-gray-700 dark:text-white dark:hover:text-white shrink-0"
              leftIcon={
                showReviewShortcuts ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )
              }
            >
              {showReviewShortcuts ? 'Hide' : 'Show'}
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
              className="text-gray-500 hover:text-gray-700 dark:text-white dark:hover:text-white shrink-0"
              leftIcon={
                showIssueShortcuts ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )
              }
            >
              {showIssueShortcuts ? 'Hide' : 'Show'}
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
              className="text-gray-500 hover:text-gray-700 dark:text-white dark:hover:text-white shrink-0"
              leftIcon={
                showApprovedShortcuts ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )
              }
            >
              {showApprovedShortcuts ? 'Hide' : 'Show'}
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Field Tech</Badge>
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
                      <Globe className="h-5 w-5 text-amber-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Global Portal</CardTitle>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">All Portals</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Lab Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Scavs</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Office Admins</Badge>
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
                      <BriefcaseBusiness className="h-5 w-5 text-emerald-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Sales Portal</CardTitle>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Sales Reps</Badge>
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
                      <Omega className="h-5 w-5 text-cyan-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Engineering Portal</CardTitle>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Engineering</Badge>
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
                      <CircleUserRound className="h-5 w-5 text-pink-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">HR Portal</CardTitle>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">HR</Badge>
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
                      <Plane className="h-5 w-5 text-gray-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Runway</CardTitle>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">General</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">General</Badge>
                </CardHeader>
                <CardContent className="px-6" />
                <CardFooter className="px-6 pb-6 pt-0">
                  <Button 
                    className="w-full bg-[#f26722] hover:bg-[#f26722]/90 text-white h-11 rounded-md inline-flex items-center justify-center whitespace-nowrap text-sm"
                    onClick={() => navigate('/features-fixes')}
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">General</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">NETA Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Lab Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Lab Technicians</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Scavs</Badge>
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
                      </div>
                    </div>
                    <Badge className="!bg-purple-500/85 !text-white px-2.5 py-1 text-xs font-medium">Admin Only</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Office Admins</Badge>
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
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Sales Reps</Badge>
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
                      <Omega className="h-5 w-5 text-cyan-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">Engineering Portal</CardTitle>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">Engineering</Badge>
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
                      <CircleUserRound className="h-5 w-5 text-pink-500 dark:text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-medium text-gray-900 dark:text-white">HR Portal</CardTitle>
                    </div>
                  </div>
                  <Badge className="!bg-[#f26722]/85 !text-white px-2.5 py-1 text-xs font-medium">HR</Badge>
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
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 border-none">
        <div className="text-center">
          <Button
            onClick={handleSignOut}
            disabled={isSigningOut}
            variant="outline"
            leftIcon={<LogOut className="h-4 w-4" />}
            className="gap-2 border-2 border-gray-200 text-black hover:bg-red-700/90 hover:text-white"
          >
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
