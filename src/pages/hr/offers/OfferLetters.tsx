import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
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
  FileText,
  Plus,
  Edit,
  Trash2,
  Eye,
  Copy,
  Save,
  X,
  Send,
  Download,
  Link as LinkIcon,
  Paperclip,
  Upload,
  UserPlus,
  Clock,
  RefreshCw,
} from "lucide-react";
import { RichTextEditor } from "@/components/helpCenter/RichTextEditor";
import {
  offersService,
  OfferTemplate,
  Offer,
  CreateOfferInput,
  OfferAttachment,
} from "../../../services/hr/offersService";
import {
  candidatesService,
  Candidate,
} from "../../../services/hr/candidatesService";
import { onboardingService } from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const OfferLetters: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Template management
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<OfferTemplate | null>(null);
  const [templateFormData, setTemplateFormData] = useState({
    name: "",
    description: "",
    template_content: "",
    is_default: false,
  });
  const getDefaultExpirationDate = () =>
    offersService.getDefaultExpirationDate(
      new Date().toISOString().split("T")[0],
    );

  // Offer creation
  const [isCreateOfferModalOpen, setIsCreateOfferModalOpen] = useState(false);
  const [isEditOfferModalOpen, setIsEditOfferModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [offerFormData, setOfferFormData] = useState<Partial<CreateOfferInput>>(
    {
      candidate_id: "",
      template_id: "",
      position_title: "",
      department: "",
      employment_type: "full-time",
      start_date: "",
      location: "",
      reporting_manager: "",
      base_salary: undefined,
      salary_currency: "USD",
      pay_frequency: "annual",
      bonus_amount: undefined,
      bonus_description: "",
      equity_compensation: "",
      benefits_summary: "",
      offer_date: new Date().toISOString().split("T")[0],
      expiration_date: getDefaultExpirationDate(),
    },
  );
  const [customizedContent, setCustomizedContent] = useState("");

  // Preview
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [signingLink, setSigningLink] = useState<string | null>(null);
  const [signingLinkOfferId, setSigningLinkOfferId] = useState<string | null>(
    null,
  );
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [attachmentsOfferId, setAttachmentsOfferId] = useState<string | null>(
    null,
  );
  const [offerAttachments, setOfferAttachments] = useState<OfferAttachment[]>(
    [],
  );
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [sendingToOnboardingOfferId, setSendingToOnboardingOfferId] = useState<
    string | null
  >(null);
  const [extendOfferId, setExtendOfferId] = useState<string | null>(null);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendNewDate, setExtendNewDate] = useState<string>("");
  const [extendRegenerateToken, setExtendRegenerateToken] =
    useState<boolean>(true);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Expiration countdown helper (mirrors the one in OfferApprovals)
  const getExpirationInfo = (
    offer: Offer,
  ): {
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
      return {
        label: "Expired",
        color: "text-red-600 dark:text-red-400",
        expired: true,
        daysLeft: 0,
      };
    }
    if (daysLeft <= 1) {
      const hoursLeft = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
      return {
        label: `Expires in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}`,
        color: "text-red-600 dark:text-red-400",
        expired: false,
        daysLeft,
      };
    }
    if (daysLeft <= 3) {
      return {
        label: `Expires in ${daysLeft} days`,
        color: "text-orange-600 dark:text-orange-400",
        expired: false,
        daysLeft,
      };
    }
    return {
      label: `Expires in ${daysLeft} days`,
      color: "text-neutral-600 dark:text-neutral-400",
      expired: false,
      daysLeft,
    };
  };

  const openExtendModal = (offerId: string) => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 5);
    setExtendOfferId(offerId);
    setExtendNewDate(defaultDate.toISOString().split("T")[0]);
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
      if (extendRegenerateToken) {
        const link = await offersService.generateSigningLink(extendOfferId);
        setSigningLinkOfferId(extendOfferId);
        setSigningLink(link);
        setShowLinkModal(true);
      }
      toast({
        title: "Expiration updated",
        description: extendRegenerateToken
          ? "New expiration set and a fresh signing link was generated."
          : "Expiration date updated. The existing signing link remains valid.",
        variant: "success",
      });
      setExtendModalOpen(false);
      setExtendOfferId(null);
      fetchData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update expiration",
        variant: "destructive",
      });
    } finally {
      setExtending(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [templatesData, offersData, candidatesData] = await Promise.all([
        offersService.getTemplates(),
        offersService.getAll(),
        candidatesService.getAll(),
      ]);
      setTemplates(templatesData);
      setOffers(offersData);
      setCandidates(
        candidatesData.filter((c) =>
          ["offer", "interview", "offer_sent", "offer_accepted"].includes(
            c.status,
          ),
        ),
      );
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    setTemplateFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleCreateTemplate = async () => {
    if (
      !templateFormData.name.trim() ||
      !templateFormData.template_content.trim()
    ) {
      toast({
        title: "Error",
        description: "Name and template content are required",
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    try {
      await offersService.createTemplate(templateFormData, user.id);
      toast({
        title: "Success",
        description: "Template created successfully",
        variant: "success",
      });
      setIsTemplateModalOpen(false);
      setTemplateFormData({
        name: "",
        description: "",
        template_content: "",
        is_default: false,
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create template",
        variant: "destructive",
      });
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    if (
      !templateFormData.name.trim() ||
      !templateFormData.template_content.trim()
    ) {
      toast({
        title: "Error",
        description: "Name and template content are required",
        variant: "destructive",
      });
      return;
    }

    try {
      await offersService.updateTemplate(selectedTemplate.id, templateFormData);
      toast({
        title: "Success",
        description: "Template updated successfully",
        variant: "success",
      });
      setIsEditTemplateModalOpen(false);
      setSelectedTemplate(null);
      setTemplateFormData({
        name: "",
        description: "",
        template_content: "",
        is_default: false,
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update template",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      await offersService.deleteTemplate(id);
      toast({
        title: "Success",
        description: "Template deleted successfully",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const openEditTemplateModal = (template: OfferTemplate) => {
    setSelectedTemplate(template);
    setTemplateFormData({
      name: template.name,
      description: template.description || "",
      template_content: template.template_content,
      is_default: template.is_default,
    });
    setIsEditTemplateModalOpen(true);
  };

  const handleOfferInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    setOfferFormData((prev) => ({
      ...prev,
      [name]:
        type === "number"
          ? value
            ? parseFloat(value)
            : undefined
          : value || "",
    }));
  };

  const handleTemplateSelect = async (templateId: string) => {
    if (!templateId) {
      setCustomizedContent("");
      return;
    }

    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setCustomizedContent(template.template_content);
      setOfferFormData((prev) => ({ ...prev, template_id: templateId }));
    }
  };

  const replaceTemplateVariables = (
    content: string,
    candidate: Candidate | undefined,
    offerData: Partial<CreateOfferInput>,
  ): string => {
    if (!candidate) return content;

    let result = content;
    result = result.replace(
      /\{\{candidate_name\}\}/g,
      `${candidate.first_name} ${candidate.last_name}`,
    );
    result = result.replace(/\{\{first_name\}\}/g, candidate.first_name);
    result = result.replace(/\{\{last_name\}\}/g, candidate.last_name);
    result = result.replace(
      /\{\{position_title\}\}/g,
      offerData.position_title || "",
    );
    result = result.replace(/\{\{department\}\}/g, offerData.department || "");
    result = result.replace(
      /\{\{employment_type\}\}/g,
      offerData.employment_type || "",
    );
    result = result.replace(
      /\{\{start_date\}\}/g,
      offerData.start_date
        ? new Date(offerData.start_date).toLocaleDateString()
        : "",
    );
    result = result.replace(/\{\{location\}\}/g, offerData.location || "");
    result = result.replace(
      /\{\{base_salary\}\}/g,
      offerData.base_salary ? `$${offerData.base_salary.toLocaleString()}` : "",
    );
    result = result.replace(
      /\{\{pay_frequency\}\}/g,
      offerData.pay_frequency || "",
    );
    result = result.replace(
      /\{\{bonus_amount\}\}/g,
      offerData.bonus_amount
        ? `$${offerData.bonus_amount.toLocaleString()}`
        : "",
    );
    result = result.replace(
      /\{\{bonus_description\}\}/g,
      offerData.bonus_description || "",
    );
    result = result.replace(
      /\{\{equity_compensation\}\}/g,
      offerData.equity_compensation || "",
    );
    result = result.replace(
      /\{\{benefits_summary\}\}/g,
      offerData.benefits_summary || "",
    );
    result = result.replace(
      /\{\{reporting_manager\}\}/g,
      offerData.reporting_manager || "",
    );
    result = result.replace(
      /\{\{offer_date\}\}/g,
      offerData.offer_date
        ? new Date(offerData.offer_date).toLocaleDateString()
        : "",
    );
    result = result.replace(
      /\{\{expiration_date\}\}/g,
      offerData.expiration_date
        ? new Date(offerData.expiration_date).toLocaleDateString()
        : "",
    );

    return result;
  };

  const handlePreview = () => {
    const candidate = candidates.find(
      (c) => c.id === offerFormData.candidate_id,
    );
    const preview = replaceTemplateVariables(
      customizedContent,
      candidate,
      offerFormData,
    );
    setPreviewContent(preview);
    setIsPreviewModalOpen(true);
  };

  const handleCreateOffer = async () => {
    // More robust validation - check for empty strings and trimmed values
    const candidateId = String(offerFormData.candidate_id || "").trim();
    const positionTitle = String(offerFormData.position_title || "").trim();
    const department = String(offerFormData.department || "").trim();

    if (!candidateId || !positionTitle || !department) {
      const missingFields = [];
      if (!candidateId) missingFields.push("Candidate");
      if (!positionTitle) missingFields.push("Position Title");
      if (!department) missingFields.push("Department");

      toast({
        title: "Error",
        description: `Please fill in all required fields: ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    try {
      const candidate = candidates.find((c) => c.id === candidateId);
      const finalContent = replaceTemplateVariables(
        customizedContent,
        candidate,
        offerFormData,
      );

      // Clean up date fields - convert empty strings to undefined
      const cleanedFormData: CreateOfferInput = {
        ...(offerFormData as CreateOfferInput),
        candidate_id: candidateId,
        position_title: positionTitle,
        department: department,
        offer_letter_content: finalContent,
        start_date:
          offerFormData.start_date && offerFormData.start_date.trim()
            ? offerFormData.start_date
            : undefined,
        offer_date:
          offerFormData.offer_date && offerFormData.offer_date.trim()
            ? offerFormData.offer_date
            : undefined,
        expiration_date:
          offerFormData.expiration_date && offerFormData.expiration_date.trim()
            ? offerFormData.expiration_date
            : undefined,
      };

      await offersService.create(cleanedFormData, user.id);

      toast({
        title: "Success",
        description: "Offer created successfully",
        variant: "success",
      });
      setIsCreateOfferModalOpen(false);
      setOfferFormData({
        candidate_id: "",
        template_id: "",
        position_title: "",
        department: "",
        employment_type: "full-time",
        start_date: "",
        location: "",
        reporting_manager: "",
        base_salary: undefined,
        salary_currency: "USD",
        pay_frequency: "annual",
        bonus_amount: undefined,
        bonus_description: "",
        equity_compensation: "",
        benefits_summary: "",
        offer_date: new Date().toISOString().split("T")[0],
        expiration_date: getDefaultExpirationDate(),
      });
      setCustomizedContent("");
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create offer",
        variant: "destructive",
      });
    }
  };

  const handleUpdateOffer = async () => {
    if (!selectedOffer) return;

    try {
      const candidate = candidates.find(
        (c) => c.id === offerFormData.candidate_id,
      );
      const finalContent = replaceTemplateVariables(
        customizedContent,
        candidate,
        offerFormData,
      );

      // Clean up date fields - convert empty strings to undefined
      const cleanedFormData: Partial<CreateOfferInput> = {
        ...offerFormData,
        offer_letter_content: finalContent,
        start_date:
          offerFormData.start_date && offerFormData.start_date.trim()
            ? offerFormData.start_date
            : undefined,
        offer_date:
          offerFormData.offer_date && offerFormData.offer_date.trim()
            ? offerFormData.offer_date
            : undefined,
        expiration_date:
          offerFormData.expiration_date && offerFormData.expiration_date.trim()
            ? offerFormData.expiration_date
            : undefined,
      };

      await offersService.update(selectedOffer.id, cleanedFormData);

      toast({
        title: "Success",
        description: "Offer updated successfully",
        variant: "success",
      });
      setIsEditOfferModalOpen(false);
      setSelectedOffer(null);
      setOfferFormData({
        candidate_id: "",
        template_id: "",
        position_title: "",
        department: "",
        employment_type: "full-time",
        start_date: "",
        location: "",
        reporting_manager: "",
        base_salary: undefined,
        salary_currency: "USD",
        pay_frequency: "annual",
        bonus_amount: undefined,
        bonus_description: "",
        equity_compensation: "",
        benefits_summary: "",
        offer_date: new Date().toISOString().split("T")[0],
        expiration_date: getDefaultExpirationDate(),
      });
      setCustomizedContent("");
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update offer",
        variant: "destructive",
      });
    }
  };

  const openEditOfferModal = (offer: Offer) => {
    setSelectedOffer(offer);
    setOfferFormData({
      candidate_id: offer.candidate_id,
      template_id: offer.template_id,
      position_title: offer.position_title,
      department: offer.department,
      employment_type: offer.employment_type,
      start_date: offer.start_date,
      location: offer.location,
      reporting_manager: offer.reporting_manager,
      base_salary: offer.base_salary,
      salary_currency: offer.salary_currency,
      pay_frequency: offer.pay_frequency,
      bonus_amount: offer.bonus_amount,
      bonus_description: offer.bonus_description,
      equity_compensation: offer.equity_compensation,
      benefits_summary: offer.benefits_summary,
      offer_date: offer.offer_date,
      expiration_date: offer.expiration_date,
    });
    setCustomizedContent(offer.offer_letter_content || "");
    setIsEditOfferModalOpen(true);
  };

  const handleSendOffer = async (offerId: string) => {
    if (
      !confirm(
        "Generate signing link and share it with the candidate. Mark as sent when you've sent the link.",
      )
    )
      return;

    try {
      const link = await offersService.generateSigningLink(offerId);
      setSigningLinkOfferId(offerId);
      setSigningLink(link);
      setShowLinkModal(true);
      toast({
        title: "Signing link ready",
        description:
          'Copy the link and send it to the candidate. Click "Mark as sent" when you\'ve sent it.',
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate signing link",
        variant: "destructive",
      });
    }
  };

  const handleGenerateSigningLink = async (offerId: string) => {
    try {
      const link = await offersService.generateSigningLink(offerId);
      setSigningLinkOfferId(offerId);
      setSigningLink(link);
      setShowLinkModal(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate signing link",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsSent = async () => {
    if (!signingLinkOfferId) return;
    try {
      setMarkingSent(true);
      await offersService.updateStatus(signingLinkOfferId, "sent");
      toast({
        title: "Marked as sent",
        description: "Offer and candidate status updated to Offer Sent.",
        variant: "success",
      });
      fetchData();
      setShowLinkModal(false);
      setSigningLinkOfferId(null);
      setSigningLink(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to mark as sent",
        variant: "destructive",
      });
    } finally {
      setMarkingSent(false);
    }
  };

  const copySigningLink = () => {
    if (signingLink) {
      navigator.clipboard.writeText(signingLink);
      toast({
        title: "Copied",
        description: "Signing link copied to clipboard",
        variant: "success",
      });
    }
  };

  const openAttachmentsModal = async (offerId: string) => {
    setAttachmentsOfferId(offerId);
    setShowAttachmentsModal(true);
    try {
      const list = await offersService.getAttachments(offerId);
      setOfferAttachments(list);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to load attachments",
        variant: "destructive",
      });
      setOfferAttachments([]);
    }
  };

  const closeAttachmentsModal = () => {
    setShowAttachmentsModal(false);
    setAttachmentsOfferId(null);
    setOfferAttachments([]);
  };

  const handleAttachmentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !attachmentsOfferId) return;
    e.target.value = "";
    setUploadingAttachment(true);
    try {
      const added = await offersService.addAttachment(attachmentsOfferId, file);
      setOfferAttachments((prev) => [...prev, added]);
      toast({
        title: "Added",
        description:
          "Attachment added. It will be available on the signing page.",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to upload",
        variant: "destructive",
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    if (!confirm("Remove this attachment?")) return;
    try {
      await offersService.deleteAttachment(id);
      setOfferAttachments((prev) => prev.filter((a) => a.id !== id));
      toast({
        title: "Removed",
        description: "Attachment removed.",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: (err as Error).message || "Failed to remove",
        variant: "destructive",
      });
    }
  };

  const handleSendToOnboarding = async (offerId: string) => {
    if (!user?.id) return;
    setSendingToOnboardingOfferId(offerId);
    try {
      await onboardingService.createOnboardingFromOffer(offerId, user.id);
      toast({
        title: "Sent to onboarding",
        description:
          "Onboarding tracking and New Hire Packet created. Open Onboarding → Onboarding Tracking.",
        variant: "success",
      });
      setSendingToOnboardingOfferId(null);
      navigate("/hr/onboarding/tracking");
    } catch (err: any) {
      setSendingToOnboardingOfferId(null);
      toast({
        title: "Error",
        description: err.message || "Failed to send to onboarding",
        variant: "destructive",
      });
    }
  };

  const generatePDF = (offer: Offer) => {
    if (!offer.offer_letter_content) {
      toast({
        title: "Error",
        description: "No offer content to generate PDF",
        variant: "destructive",
      });
      return;
    }

    // Create a new window with the offer content
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Please allow popups to generate PDF",
        variant: "destructive",
      });
      return;
    }

    const candidateName = offer.candidate
      ? `${offer.candidate.first_name} ${offer.candidate.last_name}`
      : "Candidate";

    const offerDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

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
            ${offer.expiration_date ? `<p><strong>Expiration Date:</strong> ${new Date(offer.expiration_date).toLocaleDateString()}</p>` : ""}
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

  const handleSendToApprovals = async (offerId: string) => {
    if (!confirm("Send this offer to the approval workflow?")) return;

    try {
      await offersService.updateStatus(offerId, "pending_approval");
      toast({
        title: "Success",
        description: "Offer sent to approvals",
        variant: "success",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send offer to approvals",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Offer Letters
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Manage offer letter templates and create customized offers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setTemplateFormData({
                name: "",
                description: "",
                template_content: "",
                is_default: false,
              });
              setIsTemplateModalOpen(true);
            }}
          >
            <FileText className="mr-2 h-4 w-4" />
            New Template
          </Button>
          <Button
            className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            onClick={() => {
              setOfferFormData({
                candidate_id: "",
                template_id: "",
                position_title: "",
                department: "",
                employment_type: "full-time",
                start_date: "",
                location: "",
                reporting_manager: "",
                base_salary: undefined,
                salary_currency: "USD",
                pay_frequency: "annual",
                bonus_amount: undefined,
                bonus_description: "",
                equity_compensation: "",
                benefits_summary: "",
                offer_date: new Date().toISOString().split("T")[0],
                expiration_date: getDefaultExpirationDate(),
              });
              setCustomizedContent("");
              setIsCreateOfferModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Offer
          </Button>
        </div>
      </div>

      {/* Templates Section */}
      <Card>
        <CardHeader>
          <CardTitle>Offer Letter Templates</CardTitle>
          <CardDescription>
            Create and manage reusable offer letter templates with customizable
            variables
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                No templates
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Get started by creating your first offer letter template
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {template.name}
                        </CardTitle>
                        {template.is_default && (
                          <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-[#f26722] text-white rounded">
                            Default
                          </span>
                        )}
                      </div>
                    </div>
                    {template.description && (
                      <CardDescription className="mt-2">
                        {template.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditTemplateModal(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Offers Section */}
      <Card>
        <CardHeader>
          <CardTitle>Offers</CardTitle>
          <CardDescription>View and manage all offer letters</CardDescription>
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                No offers
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Create your first offer letter
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-100"
                >
                  <div className="flex-1">
                    <div className="font-medium text-neutral-900 dark:text-white">
                      {offer.candidate
                        ? `${offer.candidate.first_name} ${offer.candidate.last_name}`
                        : "Unknown Candidate"}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      {offer.position_title} - {offer.department}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      Status:{" "}
                      <span
                        className={`font-medium ${
                          offer.status === "accepted"
                            ? "text-green-600"
                            : offer.status === "declined"
                              ? "text-red-600"
                              : offer.status === "sent"
                                ? "text-blue-600"
                                : offer.status === "expired"
                                  ? "text-red-600"
                                  : "text-neutral-600"
                        }`}
                      >
                        {offer.status.charAt(0).toUpperCase() +
                          offer.status.slice(1)}
                      </span>
                    </div>
                    {(() => {
                      const exp = getExpirationInfo(offer);
                      if (!exp) return null;
                      if (
                        !["sent", "approved", "expired"].includes(offer.status)
                      )
                        return null;
                      return (
                        <div
                          className={`flex items-center gap-1 text-xs mt-1 ${exp.color}`}
                        >
                          <Clock className="h-3 w-3" />
                          <span>
                            {exp.label}
                            {offer.expiration_date
                              ? ` (${new Date(offer.expiration_date).toLocaleDateString()})`
                              : ""}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewContent(offer.offer_letter_content || "");
                        setIsPreviewModalOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generatePDF(offer)}
                      title="Generate PDF"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditOfferModal(offer)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAttachmentsModal(offer.id)}
                      title="Benefit package & attachments"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    {offer.status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendToApprovals(offer.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Send to Approvals
                      </Button>
                    )}
                    {offer.status === "approved" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendOffer(offer.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        Send
                      </Button>
                    )}
                    {(offer.status === "sent" ||
                      offer.status === "approved") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateSigningLink(offer.id)}
                        title="Generate Signing Link"
                      >
                        <LinkIcon className="h-4 w-4" />
                      </Button>
                    )}
                    {(offer.status === "sent" ||
                      offer.status === "approved" ||
                      offer.status === "expired") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openExtendModal(offer.id)}
                        title="Extend expiration / refresh link"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {offer.status === "accepted" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendToOnboarding(offer.id)}
                        disabled={sendingToOnboardingOfferId === offer.id}
                        title="Send to Onboarding"
                        className="bg-[#f26722]/10 hover:bg-[#f26722]/20 text-[#f26722] border-[#f26722]/30"
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        {sendingToOnboardingOfferId === offer.id
                          ? "Sending..."
                          : "Send to Onboarding"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Template Modal */}
      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a new offer letter template. Use variables like{" "}
              {"{{candidate_name}}"}, {"{{position_title}}"},{" "}
              {"{{base_salary}}"}, etc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Template Name *"
              name="name"
              value={templateFormData.name}
              onChange={handleTemplateInputChange}
              required
            />
            <Textarea
              label="Description"
              name="description"
              value={templateFormData.description}
              onChange={handleTemplateInputChange}
              rows={2}
            />
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  name="is_default"
                  checked={templateFormData.is_default}
                  onChange={handleTemplateInputChange}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Set as default template
                </span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Template Content *
              </label>
              <RichTextEditor
                value={templateFormData.template_content}
                onChange={(content) =>
                  setTemplateFormData((prev) => ({
                    ...prev,
                    template_content: content,
                  }))
                }
                minHeight="300px"
                placeholder="Dear {{candidate_name}},&#10;&#10;We are pleased to offer you the position of {{position_title}}..."
              />
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              <p className="font-medium mb-1">Available variables:</p>
              <p>
                {"{{candidate_name}}"}, {"{{first_name}}"}, {"{{last_name}}"},{" "}
                {"{{position_title}}"}, {"{{department}}"},{" "}
                {"{{employment_type}}"}, {"{{start_date}}"}, {"{{location}}"},{" "}
                {"{{base_salary}}"}, {"{{pay_frequency}}"}, {"{{bonus_amount}}"}
                , {"{{bonus_description}}"}, {"{{equity_compensation}}"},{" "}
                {"{{benefits_summary}}"}, {"{{reporting_manager}}"},{" "}
                {"{{offer_date}}"}, {"{{expiration_date}}"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsTemplateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Modal */}
      <Dialog
        open={isEditTemplateModalOpen}
        onOpenChange={setIsEditTemplateModalOpen}
      >
        <DialogContent className="w-[75vw] max-w-[75vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Update the offer letter template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Template Name *"
              name="name"
              value={templateFormData.name}
              onChange={handleTemplateInputChange}
              required
            />
            <Textarea
              label="Description"
              name="description"
              value={templateFormData.description}
              onChange={handleTemplateInputChange}
              rows={2}
            />
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  name="is_default"
                  checked={templateFormData.is_default}
                  onChange={handleTemplateInputChange}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Set as default template
                </span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Template Content *
              </label>
              <RichTextEditor
                value={templateFormData.template_content}
                onChange={(content) =>
                  setTemplateFormData((prev) => ({
                    ...prev,
                    template_content: content,
                  }))
                }
                minHeight="300px"
                placeholder="Dear {{candidate_name}},&#10;&#10;We are pleased to offer you the position of {{position_title}}..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditTemplateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTemplate}
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              Update Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Offer Modal */}
      <Dialog
        open={isCreateOfferModalOpen || isEditOfferModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOfferModalOpen(false);
            setIsEditOfferModalOpen(false);
            setSelectedOffer(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditOfferModalOpen ? "Edit Offer" : "Create Offer"}
            </DialogTitle>
            <DialogDescription>
              {isEditOfferModalOpen
                ? "Update offer details"
                : "Create a new offer letter for a candidate"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Candidate *"
                name="candidate_id"
                value={offerFormData.candidate_id || ""}
                onChange={(e) => {
                  const selectedValue = e.target.value;
                  // Update candidate_id and position_title in a single state update to avoid batching issues
                  const candidate = selectedValue
                    ? candidates.find((c) => c.id === selectedValue)
                    : null;
                  setOfferFormData((prev) => ({
                    ...prev,
                    candidate_id: selectedValue || "",
                    // Auto-fill position title if empty and candidate is selected
                    position_title:
                      candidate &&
                      (!prev.position_title ||
                        prev.position_title.trim() === "")
                        ? candidate.position_applied
                        : prev.position_title,
                  }));
                }}
                options={[
                  { value: "", label: "Select a candidate..." },
                  ...candidates.map((c) => ({
                    value: c.id,
                    label: `${c.first_name} ${c.last_name} - ${c.position_applied}`,
                  })),
                ]}
                required
              />
              <Select
                label="Template"
                name="template_id"
                value={offerFormData.template_id}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                options={[
                  { value: "", label: "No template" },
                  ...templates.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Position Title *"
                name="position_title"
                value={offerFormData.position_title}
                onChange={handleOfferInputChange}
                required
              />
              <Input
                label="Department *"
                name="department"
                value={offerFormData.department}
                onChange={handleOfferInputChange}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Employment Type *"
                name="employment_type"
                value={offerFormData.employment_type}
                onChange={handleOfferInputChange}
                options={[
                  { value: "full-time", label: "Full-Time" },
                  { value: "part-time", label: "Part-Time" },
                  { value: "contract", label: "Contract" },
                  { value: "temporary", label: "Temporary" },
                ]}
                required
              />
              <Input
                label="Start Date"
                name="start_date"
                type="date"
                value={offerFormData.start_date}
                onChange={handleOfferInputChange}
              />
              <Input
                label="Location"
                name="location"
                value={offerFormData.location}
                onChange={handleOfferInputChange}
              />
            </div>
            <Input
              label="Reporting Manager"
              name="reporting_manager"
              value={offerFormData.reporting_manager}
              onChange={handleOfferInputChange}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Base Salary"
                name="base_salary"
                type="number"
                value={offerFormData.base_salary?.toString() || ""}
                onChange={handleOfferInputChange}
              />
              <Select
                label="Pay Frequency"
                name="pay_frequency"
                value={offerFormData.pay_frequency}
                onChange={handleOfferInputChange}
                options={[
                  { value: "hourly", label: "Hourly" },
                  { value: "weekly", label: "Weekly" },
                  { value: "bi-weekly", label: "Bi-Weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "annual", label: "Annual" },
                ]}
              />
              <Input
                label="Currency"
                name="salary_currency"
                value={offerFormData.salary_currency}
                onChange={handleOfferInputChange}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Bonus Amount"
                name="bonus_amount"
                type="number"
                value={offerFormData.bonus_amount?.toString() || ""}
                onChange={handleOfferInputChange}
              />
              <Textarea
                label="Bonus Description"
                name="bonus_description"
                value={offerFormData.bonus_description}
                onChange={handleOfferInputChange}
                rows={2}
              />
            </div>
            <Textarea
              label="Equity Compensation"
              name="equity_compensation"
              value={offerFormData.equity_compensation}
              onChange={handleOfferInputChange}
              rows={2}
            />
            <Textarea
              label="Benefits Summary"
              name="benefits_summary"
              value={offerFormData.benefits_summary}
              onChange={handleOfferInputChange}
              rows={3}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Offer Date"
                name="offer_date"
                type="date"
                value={offerFormData.offer_date}
                onChange={handleOfferInputChange}
              />
              <Input
                label="Expiration Date"
                name="expiration_date"
                type="date"
                value={offerFormData.expiration_date}
                onChange={handleOfferInputChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Customized Offer Letter Content *
              </label>
              <RichTextEditor
                value={customizedContent}
                onChange={setCustomizedContent}
                minHeight="300px"
                placeholder="Dear {{candidate_name}},&#10;&#10;We are pleased to offer you the position of {{position_title}}..."
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOfferModalOpen(false);
                setIsEditOfferModalOpen(false);
                setSelectedOffer(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={
                isEditOfferModalOpen ? handleUpdateOffer : handleCreateOffer
              }
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
            >
              {isEditOfferModalOpen ? "Update Offer" : "Create Offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Offer Letter Preview</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div
              className="prose max-w-none dark:prose-invert border border-neutral-200 dark:border-neutral-700 rounded-lg p-6"
              dangerouslySetInnerHTML={{
                __html:
                  previewContent ||
                  '<p class="text-neutral-500 dark:text-neutral-400">No content to preview</p>',
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPreviewModalOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachments (e.g. benefit package) Modal */}
      <Dialog
        open={showAttachmentsModal}
        onOpenChange={(open) => !open && closeAttachmentsModal()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Attachments (e.g. benefit package)</DialogTitle>
            <DialogDescription>
              Add PDFs or other documents to send with this offer. Candidates
              will see download links on the signing page.
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
                {uploadingAttachment ? "Uploading..." : "Add attachment"}
              </Button>
            </div>
            <ul className="border border-neutral-200 dark:border-neutral-700 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-700">
              {offerAttachments.length === 0 ? (
                <li className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
                  No attachments yet.
                </li>
              ) : (
                offerAttachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    <span className="text-sm text-neutral-900 dark:text-white truncate flex-1">
                      {a.name}
                    </span>
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

      {/* Signing Link Modal */}
      <Dialog
        open={showLinkModal}
        onOpenChange={(open) => {
          setShowLinkModal(open);
          if (!open) {
            setSigningLinkOfferId(null);
            setSigningLink(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Signing Link</DialogTitle>
            <DialogDescription>
              Share this link with the candidate to sign the offer letter. When
              you&apos;ve sent the link, click &quot;Mark as sent&quot; to
              update the candidate to Offer Sent (then they can move to Offer
              Accepted or Denied).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Signing Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={signingLink || ""}
                    readOnly
                    className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  />
                  <Button variant="outline" onClick={copySigningLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                <p>This link allows the candidate to:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>View the offer letter</li>
                  <li>
                    Download any benefit package or other attachments you added
                  </li>
                  <li>Download a PDF copy of the letter</li>
                  <li>Sign electronically</li>
                  <li>Accept or decline the offer</li>
                </ul>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkModal(false)}>
              Close
            </Button>
            {signingLinkOfferId &&
              offers.find((o) => o.id === signingLinkOfferId)?.status !==
                "sent" && (
                <Button
                  onClick={handleMarkAsSent}
                  disabled={markingSent}
                  className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                >
                  {markingSent ? "Updating..." : "Mark as sent"}
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend / Refresh Expiration Modal */}
      <Dialog
        open={extendModalOpen}
        onOpenChange={(open) => {
          setExtendModalOpen(open);
          if (!open) setExtendOfferId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-[#f26722]" />
              Extend Offer Expiration
            </DialogTitle>
            <DialogDescription>
              Pick a new expiration date. Optionally regenerate the signing link
              so the previously-shared link stops working.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                New expiration date
              </label>
              <input
                type="date"
                value={extendNewDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setExtendNewDate(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={extendRegenerateToken}
                onChange={(e) => setExtendRegenerateToken(e.target.checked)}
                className="mt-1"
              />
              <span>
                Regenerate the signing link (recommended). The old link will
                stop working and a fresh link will open for you to share.
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
              <RefreshCw
                className={`mr-2 h-4 w-4 ${extending ? "animate-spin" : ""}`}
              />
              {extending ? "Updating..." : "Save & Refresh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
