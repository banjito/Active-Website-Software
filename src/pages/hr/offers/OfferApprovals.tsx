import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { FileCheck, CheckCircle, XCircle, Clock, User, Eye, Plus, FileText, DollarSign, MapPin, Calendar, Search, Settings, Download, Link as LinkIcon, Copy, Paperclip, Upload, Trash2, UserPlus, ArrowRight, Users, RefreshCw, AlertCircle } from 'lucide-react';
import { offersService, Offer, OfferApproval, GlobalApprover, OfferAttachment } from '../../../services/hr/offersService';
import { onboardingService } from '../../../services/hr/onboardingService';
import { useAuth } from '../../../lib/AuthContext';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../components/ui/toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface User {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
  };
}

export const OfferApprovals: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [approvals, setApprovals] = useState<OfferApproval[]>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddApproverModalOpen, setIsAddApproverModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<OfferApproval | null>(null);
  const [approvalComments, setApprovalComments] = useState('');
  const [newApproverId, setNewApproverId] = useState('');
  const [approverSearchTerm, setApproverSearchTerm] = useState('');
  const [globalApprovers, setGlobalApprovers] = useState<GlobalApprover[]>([]);
  const [isManageApproversModalOpen, setIsManageApproversModalOpen] = useState(false);
  const [signingLink, setSigningLink] = useState<string | null>(null);
  const [signingLinkOfferId, setSigningLinkOfferId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [attachmentsOfferId, setAttachmentsOfferId] = useState<string | null>(null);
  const [offerAttachments, setOfferAttachments] = useState<OfferAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [sendingToOnboardingOfferId, setSendingToOnboardingOfferId] = useState<string | null>(null);
  const [approvalsMap, setApprovalsMap] = useState<Record<string, OfferApproval[]>>({});
  const [myPendingOfferIds, setMyPendingOfferIds] = useState<Set<string>>(new Set());
  const [viewTab, setViewTab] = useState<'mine' | 'all'>('mine');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOffer, setRejectOffer] = useState<Offer | null>(null);
  const [extendOfferId, setExtendOfferId] = useState<string | null>(null);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendNewDate, setExtendNewDate] = useState<string>('');
  const [extendRegenerateToken, setExtendRegenerateToken] = useState<boolean>(true);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    fetchData();
    fetchUsers();
    fetchGlobalApprovers();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await offersService.getAll();
      const relevant = data.filter(o =>
        ['pending_approval', 'draft', 'approved', 'sent', 'accepted', 'expired'].includes(o.status)
      );
      setOffers(relevant);

      // Load approval chains for anything needing approval display
      const chainIds = relevant
        .filter(o => ['pending_approval', 'approved'].includes(o.status))
        .map(o => o.id);
      if (chainIds.length > 0) {
        const chains = await offersService.getApprovalsForMultiple(chainIds);
        setApprovalsMap(chains);
      } else {
        setApprovalsMap({});
      }

      // Figure out which pending offers are currently waiting on *this* user
      if (user?.id) {
        const mine = await offersService.getPendingForUser(user.id);
        setMyPendingOfferIds(new Set(mine.map(m => m.offer.id)));
      } else {
        setMyPendingOfferIds(new Set());
      }
    } catch (error: any) {
      console.error('Error fetching offers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load offers. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      // Try to use admin_get_users RPC function (same as AdminUserManagement)
      let { data: adminData, error: adminError } = await supabase
        .schema('common')
        .rpc('admin_get_users');
      
      // Fallback: try without schema
      if (adminError) {
        const fallback = await supabase.rpc('admin_get_users');
        if (!fallback.error) {
          adminData = fallback.data;
          adminError = null;
        }
      }

      if (!adminError && adminData) {
        const mappedUsers = adminData.map((u: any) => ({
          id: u.id,
          email: u.email || '',
          user_metadata: {
            name: u.raw_user_meta_data?.name || u.user_metadata?.name || null,
            ...(u.raw_user_meta_data || u.user_metadata || {}),
          },
        }));
        setUsers(mappedUsers);
        return;
      }

      // Fallback: try profiles table
      const { data: profiles, error: profileError } = await supabase
        .schema('common')
        .from('profiles')
        .select('id, email, user_metadata')
        .limit(500);
      
      if (!profileError && profiles && profiles.length > 0) {
        setUsers(profiles.map((p: any) => ({
          id: p.id,
          email: p.email || '',
          user_metadata: p.user_metadata || {},
        })));
        return;
      }

      // Fallback: try users table
      const { data: usersData, error: usersError } = await supabase.from('users').select('*').limit(500);
      if (!usersError && usersData && usersData.length > 0) {
        setUsers(usersData.map((u: any) => ({
          id: u.id,
          email: u.email || '',
          user_metadata: { name: u.name || u.user_metadata?.name },
        })));
        return;
      }

      // Final fallback: use current user
      if (user) {
        setUsers([{
          id: user.id,
          email: user.email || '',
          user_metadata: user.user_metadata || {},
        }]);
      }
    } catch (error: any) {
      console.error('Error fetching users:', error);
      // If all else fails, use current user
      if (user) {
        setUsers([{
          id: user.id,
          email: user.email || '',
          user_metadata: user.user_metadata || {},
        }]);
      }
    }
  };

  const fetchGlobalApprovers = async () => {
    try {
      const data = await offersService.getGlobalApprovers();
      setGlobalApprovers(data);
    } catch (error: any) {
      console.error('Error fetching global approvers:', error);
    }
  };

  const fetchApprovals = async (offerId: string) => {
    try {
      const data = await offersService.getApprovalsByOfferId(offerId);
      setApprovals(data);
    } catch (error: any) {
      console.error('Error fetching approvals:', error);
    }
  };

  const openViewModal = async (offer: Offer) => {
    setSelectedOffer(offer);
    // If offer is pending approval, ensure approval records exist for all global approvers
    if (offer.status === 'pending_approval') {
      const existingApprovals = await offersService.getApprovalsByOfferId(offer.id);
      const existingApproverIds = new Set(existingApprovals.map(a => a.approver_id));
      
      // Create approval records for any active global approvers that don't have one yet
      const activeApprovers = globalApprovers.filter(a => a.is_active);
      for (const approver of activeApprovers) {
        if (!existingApproverIds.has(approver.approver_id)) {
          await offersService.createApproval(offer.id, approver.approver_id, approver.approval_order);
        }
      }
    }
    await fetchApprovals(offer.id);
    setIsViewModalOpen(true);
  };

  const handleAddGlobalApprover = async () => {
    if (!newApproverId || !user) {
      toast({
        title: 'Error',
        description: 'Please select an approver',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Check if approver already exists
      const existing = globalApprovers.find(a => a.approver_id === newApproverId);
      if (existing) {
        toast({
          title: 'Error',
          description: 'This user is already a global approver',
          variant: 'destructive',
        });
        return;
      }

      const nextOrder = globalApprovers.length > 0
        ? Math.max(...globalApprovers.map(a => a.approval_order)) + 1
        : 1;

      await offersService.addGlobalApprover(newApproverId, nextOrder, user.id);

      toast({
        title: 'Success',
        description: 'Global approver added successfully',
        variant: 'success',
      });
      setIsAddApproverModalOpen(false);
      setNewApproverId('');
      setApproverSearchTerm('');
      await fetchGlobalApprovers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add global approver',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveGlobalApprover = async (id: string) => {
    if (!confirm('Are you sure you want to remove this global approver?')) return;

    try {
      await offersService.removeGlobalApprover(id);
      toast({
        title: 'Success',
        description: 'Global approver removed successfully',
        variant: 'success',
      });
      await fetchGlobalApprovers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove global approver',
        variant: 'destructive',
      });
    }
  };

  const handleApprove = async (approval: OfferApproval, approved: boolean) => {
    setSelectedApproval(approval);
    setApprovalComments('');
    setIsApproveModalOpen(true);
  };

  const confirmApproval = async () => {
    if (!selectedApproval || !selectedOffer) return;

    try {
      // Check approval status - if approved, mark offer as approved immediately
      // If rejected, check if we should revert to draft
      const updatedApprovals = await offersService.getApprovalsByOfferId(selectedOffer.id);
      const hasApproval = updatedApprovals.some(a => a.status === 'approved');
      const hasRejection = updatedApprovals.some(a => a.status === 'rejected');

      if (selectedApproval.status === 'approved' && hasApproval) {
        // If at least one approval, mark offer as approved
        await offersService.updateStatus(selectedOffer.id, 'approved');
      } else if (selectedApproval.status === 'rejected' && hasRejection) {
        // If rejected, revert to draft
        await offersService.updateStatus(selectedOffer.id, 'draft');
      }

      toast({
        title: 'Success',
        description: `Approval ${selectedApproval.status === 'approved' ? 'approved' : 'rejected'} successfully`,
        variant: 'success',
      });
      setIsApproveModalOpen(false);
      setSelectedApproval(null);
      setApprovalComments('');
      await fetchApprovals(selectedOffer.id);
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process approval',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getApproverName = (approverId: string) => {
    const approver = users.find(u => u.id === approverId);
    return approver?.user_metadata?.name || approver?.email || 'Unknown';
  };

  const isCurrentUserGlobalApprover = () => {
    if (!user) return false;
    return globalApprovers.some(a => a.approver_id === user.id && a.is_active);
  };

  const getCurrentUserApproval = () => {
    if (!user) return null;
    return approvals.find(a => a.approver_id === user.id && a.status === 'pending');
  };

  const handleGenerateSigningLink = async (offer: Offer) => {
    try {
      if (!offer || !offer.id) {
        toast({
          title: 'Error',
          description: 'Invalid offer data',
          variant: 'destructive',
        });
        return;
      }

      console.log('Generating signing link for offer:', offer.id);
      const link = await offersService.generateSigningLink(offer.id);
      setSigningLinkOfferId(offer.id);
      setSigningLink(link);
      setShowLinkModal(true);
    } catch (error: any) {
      console.error('Error generating signing link:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate signing link. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const copySigningLink = () => {
    if (signingLink) {
      navigator.clipboard.writeText(signingLink);
      toast({
        title: 'Copied',
        description: 'Signing link copied to clipboard',
        variant: 'success',
      });
    }
  };

  const handleMarkAsSent = async () => {
    if (!signingLinkOfferId) return;
    try {
      setMarkingSent(true);
      await offersService.updateStatus(signingLinkOfferId, 'sent');
      toast({
        title: 'Marked as sent',
        description: 'Offer and candidate status updated to Offer Sent.',
        variant: 'success',
      });
      fetchData();
      setShowLinkModal(false);
      setSigningLinkOfferId(null);
      setSigningLink(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark as sent',
        variant: 'destructive',
      });
    } finally {
      setMarkingSent(false);
    }
  };

  const openAttachmentsModal = async (offerId: string) => {
    setAttachmentsOfferId(offerId);
    setShowAttachmentsModal(true);
    try {
      const list = await offersService.getAttachments(offerId);
      setOfferAttachments(list);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load attachments', variant: 'destructive' });
      setOfferAttachments([]);
    }
  };

  const closeAttachmentsModal = () => {
    setShowAttachmentsModal(false);
    setAttachmentsOfferId(null);
    setOfferAttachments([]);
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !attachmentsOfferId) return;
    e.target.value = '';
    setUploadingAttachment(true);
    try {
      const added = await offersService.addAttachment(attachmentsOfferId, file);
      setOfferAttachments(prev => [...prev, added]);
      toast({ title: 'Added', description: 'Attachment will be available on the signing page.', variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to upload', variant: 'destructive' });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    if (!confirm('Remove this attachment?')) return;
    try {
      await offersService.deleteAttachment(id);
      setOfferAttachments(prev => prev.filter(a => a.id !== id));
      toast({ title: 'Removed', description: 'Attachment removed.', variant: 'success' });
    } catch (err: any) {
      toast({ title: 'Error', description: (err as Error).message || 'Failed to remove', variant: 'destructive' });
    }
  };

  const generatePDF = (offer: Offer) => {
    if (!offer.offer_letter_content) {
      toast({
        title: 'Error',
        description: 'No offer content to generate PDF',
        variant: 'destructive',
      });
      return;
    }

    // Create a new window with the offer content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Error',
        description: 'Please allow popups to generate PDF',
        variant: 'destructive',
      });
      return;
    }

    const candidateName = offer.candidate 
      ? `${offer.candidate.first_name} ${offer.candidate.last_name}`
      : 'Candidate';

    const offerDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Offer Letter - ${candidateName}</title>
          <style>
            @media print {
              @page {
                size: letter;
                margin: 1in;
              }
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #000;
              }
            }
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #000;
              max-width: 8.5in;
              margin: 0 auto;
              padding: 1in;
            }
            .offer-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 2rem;
              padding-bottom: 1rem;
              border-bottom: 2px solid #000;
            }
            .offer-header-left {
              flex: 0 0 auto;
            }
            .offer-header-left img {
              height: 60px;
              width: auto;
            }
            .offer-header-right {
              flex: 1;
              text-align: right;
            }
            .offer-header-right h1 {
              margin: 0;
              font-size: 24px;
              font-weight: bold;
              letter-spacing: 2px;
              margin-bottom: 0.5rem;
            }
            .offer-header-right .date {
              font-size: 14px;
              color: #333;
            }
            .offer-content {
              white-space: pre-wrap;
              margin-top: 2rem;
            }
            .footer {
              margin-top: 2rem;
              padding-top: 1rem;
              border-top: 1px solid #ccc;
            }
          </style>
        </head>
        <body>
          <div class="offer-header">
            <div class="offer-header-left">
              <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png" alt="AMP Logo" />
            </div>
            <div class="offer-header-right">
              <h1>OFFER LETTER</h1>
              <div class="date">${offerDate}</div>
            </div>
          </div>
          <div class="offer-content">${offer.offer_letter_content}</div>
          <div class="footer">
            ${offer.expiration_date ? `<p><strong>Expiration Date:</strong> ${new Date(offer.expiration_date).toLocaleDateString()}</p>` : ''}
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const pendingOffers = offers.filter(o => o.status === 'pending_approval');
  const approvedOffers = offers.filter(o => o.status === 'approved');
  const acceptedOffers = offers.filter(o => o.status === 'accepted');
  const draftOffers = offers.filter(o => o.status === 'draft');

  // --- Sequential approval / expiration helpers ---
  const isMyTurn = (offerId: string) => myPendingOfferIds.has(offerId);

  const handleSequentialApprove = async (offer: Offer) => {
    if (!user?.id) return;
    try {
      setApproving(true);
      const { allApproved } = await offersService.approveStep(offer.id, user.id);
      toast({
        title: allApproved ? 'Fully Approved' : 'Approved',
        description: allApproved
          ? 'All approvers have signed off. The offer is now approved and ready to send.'
          : 'Your approval has been recorded and the next approver has been notified.',
        variant: 'success',
      });
      setIsViewModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to approve offer',
        variant: 'destructive',
      });
    } finally {
      setApproving(false);
    }
  };

  const openRejectModal = (offer: Offer) => {
    setRejectOffer(offer);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const handleSequentialReject = async () => {
    if (!rejectOffer || !user?.id) return;
    if (!rejectReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a reason for rejection',
        variant: 'destructive',
      });
      return;
    }
    try {
      setRejecting(true);
      await offersService.rejectStep(rejectOffer.id, user.id, rejectReason);
      toast({
        title: 'Rejected',
        description: 'Offer has been rejected and reverted to draft.',
        variant: 'success',
      });
      setIsRejectModalOpen(false);
      setIsViewModalOpen(false);
      setRejectOffer(null);
      setRejectReason('');
      fetchData();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to reject offer',
        variant: 'destructive',
      });
    } finally {
      setRejecting(false);
    }
  };

  const getExpirationInfo = (offer: Offer): {
    label: string;
    color: string;
    expired: boolean;
    daysLeft: number;
  } | null => {
    if (!offer.expiration_date) return null;
    const now = new Date();
    const exp = new Date(offer.expiration_date);
    exp.setHours(23, 59, 59, 999);
    const diffMs = exp.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffMs <= 0) {
      return { label: 'Expired', color: 'text-red-600 dark:text-red-400', expired: true, daysLeft: 0 };
    }
    if (daysLeft <= 1) {
      const hoursLeft = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
      return {
        label: `Expires in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`,
        color: 'text-red-600 dark:text-red-400',
        expired: false,
        daysLeft,
      };
    }
    if (daysLeft <= 3) {
      return {
        label: `Expires in ${daysLeft} days`,
        color: 'text-orange-600 dark:text-orange-400',
        expired: false,
        daysLeft,
      };
    }
    return {
      label: `Expires in ${daysLeft} days`,
      color: 'text-gray-600 dark:text-gray-400',
      expired: false,
      daysLeft,
    };
  };

  const openExtendModal = (offer: Offer) => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + 5);
    setExtendOfferId(offer.id);
    setExtendNewDate(baseDate.toISOString().split('T')[0]);
    setExtendRegenerateToken(true);
    setExtendModalOpen(true);
  };

  const handleExtendExpiration = async () => {
    if (!extendOfferId) return;
    try {
      setExtending(true);
      await offersService.refreshExpirationDate(extendOfferId, {
        newDate: extendNewDate,
        regenerateToken: extendRegenerateToken,
      });
      // If the user chose to regenerate the token, immediately surface the new link
      if (extendRegenerateToken) {
        const link = await offersService.generateSigningLink(extendOfferId);
        setSigningLinkOfferId(extendOfferId);
        setSigningLink(link);
        setShowLinkModal(true);
      }
      toast({
        title: 'Expiration updated',
        description: extendRegenerateToken
          ? 'New expiration date set and a new signing link was generated.'
          : 'Expiration date updated. The existing signing link remains valid.',
        variant: 'success',
      });
      setExtendModalOpen(false);
      setExtendOfferId(null);
      fetchData();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update expiration',
        variant: 'destructive',
      });
    } finally {
      setExtending(false);
    }
  };

  // Approval chain pill display (mirrors RequisitionApprovals)
  const ApprovalChain: React.FC<{
    approvers: OfferApproval[];
    currentStep: number;
    compact?: boolean;
  }> = ({ approvers, currentStep, compact }) => (
    <div className={`flex items-center gap-${compact ? '1' : '2'} flex-wrap`}>
      {approvers.map((approver, idx) => {
        const isCurrentStep = approver.approval_order === currentStep;
        return (
          <React.Fragment key={approver.id}>
            {idx > 0 && (
              <ArrowRight className={`${compact ? 'h-3 w-3' : 'h-4 w-4'} text-gray-300 dark:text-gray-600 shrink-0`} />
            )}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                approver.status === 'approved'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : approver.status === 'rejected'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : isCurrentStep
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 ring-2 ring-yellow-300 dark:ring-yellow-700'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {approver.status === 'approved' && <CheckCircle className="h-3 w-3" />}
              {approver.status === 'rejected' && <XCircle className="h-3 w-3" />}
              {approver.status === 'pending' && isCurrentStep && <Clock className="h-3 w-3 animate-pulse" />}
              <span>{getApproverName(approver.approver_id)}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  const handleSendToOnboarding = async (offerId: string) => {
    if (!user?.id) return;
    setSendingToOnboardingOfferId(offerId);
    try {
      await onboardingService.createOnboardingFromOffer(offerId, user.id);
      toast({
        title: 'Sent to onboarding',
        description: 'Onboarding tracking and New Hire Packet created.',
        variant: 'success',
      });
      setSendingToOnboardingOfferId(null);
      navigate('/hr/onboarding/tracking');
    } catch (err: any) {
      setSendingToOnboardingOfferId(null);
      toast({
        title: 'Error',
        description: err.message || 'Failed to send to onboarding',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LoadingSpinner size="md" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Offer Approvals</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Route offers for manager and HR sign-off
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setApproverSearchTerm('');
            setNewApproverId('');
            setIsManageApproversModalOpen(true);
          }}
        >
          <Settings className="h-4 w-4 mr-2" />
          Manage Approvers
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {pendingOffers.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {approvedOffers.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Draft
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {draftOffers.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Mine vs All */}
      <div className="flex gap-1 bg-gray-100 dark:bg-dark-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setViewTab('mine')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewTab === 'mine'
              ? 'bg-white dark:bg-dark-150 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          My Approvals ({myPendingOfferIds.size})
        </button>
        <button
          onClick={() => setViewTab('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewTab === 'all'
              ? 'bg-white dark:bg-dark-150 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          All Pending ({pendingOffers.length})
        </button>
      </div>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle>
            {viewTab === 'mine' ? 'Waiting for Your Approval' : 'Pending Approval'}
          </CardTitle>
          <CardDescription>
            {viewTab === 'mine'
              ? 'Offers where you are the current approver in the chain'
              : 'All offers waiting for approval, showing the full approval chain'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const list = viewTab === 'mine'
              ? pendingOffers.filter(o => myPendingOfferIds.has(o.id))
              : pendingOffers;

            if (list.length === 0) {
              return (
                <div className="text-center py-12">
                  <FileCheck className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                    {viewTab === 'mine' ? 'No approvals assigned to you' : 'No pending approvals'}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {viewTab === 'mine'
                      ? 'You have no offers waiting on your approval'
                      : 'All offers have been reviewed'}
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {list.map((offer) => {
                  const chain = approvalsMap[offer.id] || [];
                  const currentStep = offer.current_approval_step || 1;
                  const canApprove = isMyTurn(offer.id);
                  const exp = getExpirationInfo(offer);
                  return (
                    <div
                      key={offer.id}
                      className={`p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100 ${
                        canApprove
                          ? 'border-l-4 border-l-[#f26722] border-gray-200 dark:border-gray-700'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {offer.candidate
                                ? `${offer.candidate.first_name} ${offer.candidate.last_name}`
                                : 'Unknown Candidate'}
                            </div>
                            {canApprove && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-[#f26722]/10 text-[#f26722] ring-1 ring-[#f26722]/30">
                                Your Turn
                              </span>
                            )}
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                              Step {currentStep} of {chain.length || '?'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {offer.position_title} - {offer.department}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Base Salary: {offer.base_salary ? `$${offer.base_salary.toLocaleString()}` : 'N/A'}
                          </div>
                          {exp && (
                            <div className={`text-xs mt-1 flex items-center gap-1 ${exp.color}`}>
                              <Clock className="h-3 w-3" />
                              {exp.label}
                              {offer.expiration_date && (
                                <span className="text-gray-500 dark:text-gray-500">
                                  ({new Date(offer.expiration_date).toLocaleDateString()})
                                </span>
                              )}
                            </div>
                          )}
                          {chain.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-200">
                              <div className="flex items-center gap-2 mb-2">
                                <Users className="h-3 w-3 text-gray-400" />
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                  Approval Chain
                                </span>
                              </div>
                              <ApprovalChain approvers={chain} currentStep={currentStep} />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end shrink-0">
                          <div className="flex gap-2 flex-wrap justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAttachmentsModal(offer.id)}
                              title="Benefit package & attachments"
                            >
                              <Paperclip className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openExtendModal(offer)}
                              title="Extend expiration / refresh link"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Extend
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateSigningLink(offer)}
                              title="Generate Signing Link"
                            >
                              <LinkIcon className="h-4 w-4 mr-1" />
                              Offer Link
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openViewModal(offer)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </div>
                          {canApprove && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSequentialApprove(offer)}
                                disabled={approving}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {approving ? 'Approving...' : 'Approve'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRejectModal(offer)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Approved Offers */}
      <Card>
        <CardHeader>
          <CardTitle>Approved Offers</CardTitle>
          <CardDescription>
            Offers that have been approved and are ready to send
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approvedOffers.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No approved offers</h3>
            </div>
          ) : (
            <div className="space-y-3">
              {approvedOffers.map((offer) => {
                const exp = getExpirationInfo(offer);
                return (
                  <div
                    key={offer.id}
                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {offer.candidate ? `${offer.candidate.first_name} ${offer.candidate.last_name}` : 'Unknown Candidate'}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {offer.position_title} - {offer.department}
                      </div>
                      {exp && (
                        <div className={`text-xs mt-1 flex items-center gap-1 ${exp.color}`}>
                          <Clock className="h-3 w-3" />
                          {exp.label}
                          {offer.expiration_date && (
                            <span className="text-gray-500 dark:text-gray-500">
                              ({new Date(offer.expiration_date).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAttachmentsModal(offer.id)}
                        title="Benefit package & attachments"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openExtendModal(offer)}
                        title="Extend expiration / refresh link"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Extend
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateSigningLink(offer)}
                        title="Generate Signing Link"
                      >
                        <LinkIcon className="h-4 w-4 mr-1" />
                        Offer Letter Link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openViewModal(offer)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Offer
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accepted Offers - Send to Onboarding */}
      <Card>
        <CardHeader>
          <CardTitle>Accepted Offers</CardTitle>
          <CardDescription>
            Send to Onboarding to create an Onboarding Tracking record and New Hire Packet
          </CardDescription>
        </CardHeader>
        <CardContent>
          {acceptedOffers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <CheckCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p>No accepted offers.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {acceptedOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-100"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {offer.candidate ? `${offer.candidate.first_name} ${offer.candidate.last_name}` : 'Unknown Candidate'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {offer.position_title} - {offer.department}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(offer)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Offer
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSendToOnboarding(offer.id)}
                      disabled={sendingToOnboardingOfferId === offer.id}
                      title="Send to Onboarding"
                      className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      {sendingToOnboardingOfferId === offer.id ? 'Sending...' : 'Send to Onboarding'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attachments (e.g. benefit package) Modal */}
      <Dialog open={showAttachmentsModal} onOpenChange={(open) => !open && closeAttachmentsModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Attachments (e.g. benefit package)</DialogTitle>
            <DialogDescription>
              Add PDFs or other documents to send with this offer. Candidates will see download links on the signing page.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2">
              <input
                ref={attachmentInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                disabled={uploadingAttachment}
                onChange={handleAttachmentUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAttachment}
                onClick={() => attachmentInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploadingAttachment ? 'Uploading...' : 'Add attachment'}
              </Button>
            </div>
            <ul className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
              {offerAttachments.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No attachments yet.</li>
              ) : (
                offerAttachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2">
                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{a.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteAttachment(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAttachmentsModal}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Offer Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Offer Letter</DialogTitle>
            <DialogDescription>
              {selectedOffer && selectedOffer.candidate
                ? `Offer letter for ${selectedOffer.candidate.first_name} ${selectedOffer.candidate.last_name} - ${selectedOffer.position_title}`
                : 'View offer letter'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {selectedOffer && (
              <>
                {/* Your Turn to Approve banner */}
                {selectedOffer.status === 'pending_approval' && isMyTurn(selectedOffer.id) && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Your Approval Required</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Review the offer below and approve or reject it. Previous approvers have signed off; the next approver will be notified after you approve.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleSequentialApprove(selectedOffer)}
                          disabled={approving}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {approving ? 'Approving...' : 'Approve'}
                        </Button>
                        <Button
                          onClick={() => openRejectModal(selectedOffer)}
                          variant="outline"
                          className="border-red-600 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Awaiting someone else */}
                {selectedOffer.status === 'pending_approval' && !isMyTurn(selectedOffer.id) && (() => {
                  const chain = approvalsMap[selectedOffer.id] || approvals;
                  const currentStep = selectedOffer.current_approval_step || 1;
                  const current = chain.find(a => a.approval_order === currentStep);
                  if (!current) return null;
                  return (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">Awaiting Approval</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Currently waiting on <strong>{getApproverName(current.approver_id)}</strong> (Step {currentStep} of {chain.length}).
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Approval Chain Progress */}
                {(approvalsMap[selectedOffer.id] || approvals).length > 0 && (
                  <div className="p-4 bg-gray-50 dark:bg-dark-100 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-gray-500" />
                      <label className="text-sm font-semibold text-gray-900 dark:text-white">Approval Chain Progress</label>
                    </div>
                    <div className="space-y-3">
                      {(approvalsMap[selectedOffer.id] || approvals).map((approver, idx) => {
                        const currentStep = selectedOffer.current_approval_step || 1;
                        const isCurrentStep = approver.approval_order === currentStep && selectedOffer.status === 'pending_approval';
                        return (
                          <div
                            key={approver.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              approver.status === 'approved'
                                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                                : approver.status === 'rejected'
                                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                                  : isCurrentStep
                                    ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
                                    : 'border-gray-200 bg-white dark:border-dark-200 dark:bg-dark-150'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                approver.status === 'approved'
                                  ? 'bg-green-500 text-white'
                                  : approver.status === 'rejected'
                                    ? 'bg-red-500 text-white'
                                    : isCurrentStep
                                      ? 'bg-yellow-500 text-white'
                                      : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {approver.status === 'approved' ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : approver.status === 'rejected' ? (
                                <XCircle className="h-4 w-4" />
                              ) : (
                                idx + 1
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {getApproverName(approver.approver_id)}
                                {approver.approver_id === user?.id && (
                                  <span className="ml-2 text-xs text-[#f26722]">(You)</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {approver.status === 'approved'
                                  ? `Approved ${approver.approved_at ? new Date(approver.approved_at).toLocaleString() : ''}`
                                  : approver.status === 'rejected'
                                    ? `Rejected ${approver.approved_at ? new Date(approver.approved_at).toLocaleString() : ''}`
                                    : isCurrentStep
                                      ? 'Awaiting approval...'
                                      : 'Pending'}
                              </p>
                              {approver.status === 'rejected' && approver.comments && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                  Reason: {approver.comments}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expiration countdown inside modal */}
                {selectedOffer.expiration_date && (() => {
                  const exp = getExpirationInfo(selectedOffer);
                  if (!exp) return null;
                  return (
                    <div
                      className={`p-3 rounded-lg flex items-center justify-between gap-3 ${
                        exp.expired
                          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                          : exp.daysLeft <= 3
                            ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                            : 'bg-gray-50 dark:bg-dark-100 border border-gray-200 dark:border-dark-200'
                      }`}
                    >
                      <div className={`flex items-center gap-2 text-sm ${exp.color}`}>
                        <Clock className="h-4 w-4" />
                        <span>
                          <strong>{exp.label}</strong>
                          {' '}— expires {new Date(selectedOffer.expiration_date).toLocaleDateString()}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openExtendModal(selectedOffer)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Extend / Refresh Link
                      </Button>
                    </div>
                  );
                })()}

                {/* Offer Details */}
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Candidate:</span>
                      <span className="ml-2 text-gray-900 dark:text-white font-medium">
                        {selectedOffer.candidate ? `${selectedOffer.candidate.first_name} ${selectedOffer.candidate.last_name}` : 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Position:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.position_title}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Department:</span>
                      <span className="ml-2 text-gray-900 dark:text-white">{selectedOffer.department}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Base Salary:</span>
                      <span className="ml-2 text-gray-900 dark:text-white font-semibold">
                        {selectedOffer.base_salary ? `$${selectedOffer.base_salary.toLocaleString()}` : 'N/A'}
                        {selectedOffer.pay_frequency && ` / ${selectedOffer.pay_frequency}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Offer Letter Content */}
                <div
                  className="prose max-w-none dark:prose-invert border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-900"
                  dangerouslySetInnerHTML={{ __html: selectedOffer.offer_letter_content || '<p>No offer letter content available.</p>' }}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              {selectedOffer && (
                <Button
                  variant="outline"
                  onClick={() => generatePDF(selectedOffer)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Global Approvers Modal */}
      <Dialog open={isManageApproversModalOpen} onOpenChange={(open) => {
        setIsManageApproversModalOpen(open);
        if (!open) {
          setApproverSearchTerm('');
          setNewApproverId('');
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Global Approvers</DialogTitle>
            <DialogDescription>
              Configure approvers who can approve any offer letter. These approvers will be notified for all offers sent to approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Current Approvers</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setApproverSearchTerm('');
                  setNewApproverId('');
                  setIsAddApproverModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Approver
              </Button>
            </div>
            {globalApprovers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <User className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No approvers configured yet.</p>
                <p className="text-sm mt-2">Click "Add Approver" to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {globalApprovers.map((approver) => (
                  <div
                    key={approver.id}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold">
                        {approver.approval_order}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {getApproverName(approver.approver_id)}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Approval Order: {approver.approval_order} {!approver.is_active && '(Inactive)'}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveGlobalApprover(approver.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageApproversModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Approver Modal */}
      <Dialog open={isAddApproverModalOpen} onOpenChange={(open) => {
        setIsAddApproverModalOpen(open);
        if (!open) {
          setApproverSearchTerm('');
          setNewApproverId('');
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Global Approver</DialogTitle>
            <DialogDescription>
              Search and select a manager or HR representative to add as a global approver
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={approverSearchTerm}
                onChange={(e) => setApproverSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              />
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-96 overflow-y-auto">
              {users.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <User className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No users available</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users
                    .filter((u) => {
                      const searchLower = approverSearchTerm.toLowerCase();
                      const name = (u.user_metadata?.name || '').toLowerCase();
                      const email = (u.email || '').toLowerCase();
                      return !approverSearchTerm || name.includes(searchLower) || email.includes(searchLower);
                    })
                    .map((u) => {
                      const isSelected = newApproverId === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setNewApproverId(u.id)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                            isSelected ? 'bg-[#f26722]/10 border-l-4 border-[#f26722]' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">
                                {(u.user_metadata?.name || u.email || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {u.user_metadata?.name || 'No name'}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {u.email}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle className="h-5 w-5 text-[#f26722]" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
            {approverSearchTerm && users.filter((u) => {
              const searchLower = approverSearchTerm.toLowerCase();
              const name = (u.user_metadata?.name || '').toLowerCase();
              const email = (u.email || '').toLowerCase();
              return name.includes(searchLower) || email.includes(searchLower);
            }).length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No users found matching "{approverSearchTerm}"
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsAddApproverModalOpen(false);
              setApproverSearchTerm('');
              setNewApproverId('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddGlobalApprover} 
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
              disabled={!newApproverId}
            >
              Add Approver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signing Link Modal */}
      <Dialog open={showLinkModal} onOpenChange={(open) => {
        setShowLinkModal(open);
        if (!open) {
          setSigningLinkOfferId(null);
          setSigningLink(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Offer Letter Signing Link</DialogTitle>
            <DialogDescription>
              Share this link with the candidate to view and sign the offer letter electronically. When you&apos;ve sent the link, click &quot;Mark as sent&quot; to update the candidate to Offer Sent.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Signing Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={signingLink || ''}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <Button
                    variant="outline"
                    onClick={copySigningLink}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                <p>This link allows the candidate to:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>View the offer letter</li>
                  <li>Sign electronically</li>
                  <li>Submit the signed offer</li>
                </ul>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkModal(false)}>
              Close
            </Button>
            {signingLinkOfferId && offers.find(o => o.id === signingLinkOfferId)?.status !== 'sent' && (
              <Button
                onClick={handleMarkAsSent}
                disabled={markingSent}
                className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
              >
                {markingSent ? 'Updating...' : 'Mark as sent'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sequential Reject Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={(open) => {
        setIsRejectModalOpen(open);
        if (!open) {
          setRejectOffer(null);
          setRejectReason('');
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              Reject Offer Letter
            </DialogTitle>
            <DialogDescription>
              Rejecting will revert this offer to draft so it can be edited and resubmitted. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          {rejectOffer && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 dark:bg-dark-100 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Rejecting:{' '}
                  <span className="font-semibold">
                    {rejectOffer.candidate
                      ? `${rejectOffer.candidate.first_name} ${rejectOffer.candidate.last_name}`
                      : 'Unknown Candidate'}
                  </span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {rejectOffer.position_title} &bull; {rejectOffer.department}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-white mb-2 block">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Please explain why this offer is being rejected..."
                  rows={5}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This reason will be saved with the approval record and visible to the offer creator.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectModalOpen(false);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSequentialReject}
              disabled={!rejectReason.trim() || rejecting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <XCircle className="mr-2 h-4 w-4" />
              {rejecting ? 'Rejecting...' : 'Reject Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend / Refresh Expiration Modal */}
      <Dialog open={extendModalOpen} onOpenChange={(open) => {
        setExtendModalOpen(open);
        if (!open) setExtendOfferId(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-[#f26722]" />
              Extend Offer Expiration
            </DialogTitle>
            <DialogDescription>
              Pick a new expiration date. Optionally regenerate the signing link so the previously-shared link stops working once the new one is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New expiration date
              </label>
              <input
                type="date"
                value={extendNewDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setExtendNewDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-150 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={extendRegenerateToken}
                onChange={(e) => setExtendRegenerateToken(e.target.checked)}
                className="mt-1"
              />
              <span>
                Regenerate the signing link (recommended). The old link will stop working and a fresh link will be generated for you to share.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleExtendExpiration}
              disabled={!extendNewDate || extending}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${extending ? 'animate-spin' : ''}`} />
              {extending ? 'Updating...' : 'Save & Refresh'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject Modal */}
      <Dialog open={isApproveModalOpen} onOpenChange={setIsApproveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedApproval?.status === 'pending' ? 'Approve or Reject' : 'Update Approval'}
            </DialogTitle>
            <DialogDescription>
              Add comments and confirm your decision
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              label="Comments"
              value={approvalComments}
              onChange={(e) => setApprovalComments(e.target.value)}
              rows={4}
              placeholder="Add any comments about this approval..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveModalOpen(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (selectedApproval) {
                    try {
                      await offersService.updateApproval(selectedApproval.id, 'rejected', approvalComments);
                      await confirmApproval();
                    } catch (error) {
                      console.error('Error rejecting:', error);
                    }
                  }
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Reject
              </Button>
              <Button
                onClick={async () => {
                  if (selectedApproval) {
                    try {
                      await offersService.updateApproval(selectedApproval.id, 'approved', approvalComments);
                      await confirmApproval();
                    } catch (error) {
                      console.error('Error approving:', error);
                    }
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Approve
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
